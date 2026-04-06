import React, { useState, useEffect, useCallback } from 'react';
import { t } from '../app/theme';
import 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { sendPushNotification, getUserPushToken } from '../lib/notifications';

export default function SwapInboxScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('received');
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;
      const uid = sessionData.session.user.id;
      setUserId(uid);

      await Promise.all([fetchReceived(uid), fetchSent(uid)]);
    } catch (err) {
      console.warn('Error loading swap data:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const fetchReceived = async (uid) => {
    // Get listings owned by current user, then find interests on them
    const { data: myListings } = await supabase
      .from('listings')
      .select('id')
      .eq('user_id', uid);

    if (!myListings || myListings.length === 0) {
      setReceived([]);
      return;
    }

    const myListingIds = myListings.map((l) => l.id);

    const { data: interests, error } = await supabase
      .from('swap_interests')
      .select(`
        *,
        listing:listings(id, title, brand, size, estimated_value),
        profile:profiles!swap_interests_interested_user_id_fkey(username, display_name, avatar_url)
      `)
      .in('listing_id', myListingIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching received:', error.message);
      setReceived([]);
      return;
    }

    // For each interest, fetch the swap_offer and offered listing details
    const enriched = await Promise.all(
      (interests || []).map(async (interest) => {
        const { data: offers } = await supabase
          .from('swap_offers')
          .select('*')
          .eq('interest_id', interest.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const offer = offers && offers.length > 0 ? offers[0] : null;
        let offeredListings = [];

        if (offer && offer.offered_listing_ids && offer.offered_listing_ids.length > 0) {
          const { data: listings } = await supabase
            .from('listings')
            .select('id, title, brand, size, listing_images(image_url, display_order)')
            .in('id', offer.offered_listing_ids);

          offeredListings = (listings || []).map((l) => {
            const images = (l.listing_images || []).sort(
              (a, b) => a.display_order - b.display_order
            );
            return { ...l, coverImage: images[0]?.image_url || null };
          });
        }

        // Fetch target listing image
        let targetImage = null;
        if (interest.listing) {
          const { data: imgs } = await supabase
            .from('listing_images')
            .select('image_url')
            .eq('listing_id', interest.listing.id)
            .order('display_order', { ascending: true })
            .limit(1);
          if (imgs && imgs.length > 0) targetImage = imgs[0].image_url;
        }

        return {
          ...interest,
          offer,
          offeredListings,
          targetImage,
        };
      })
    );

    setReceived(enriched);
  };

  const fetchSent = async (uid) => {
    const { data: interests, error } = await supabase
      .from('swap_interests')
      .select(`
        *,
        listing:listings(id, title, brand, size, estimated_value, user_id,
          listing_images(image_url, display_order)
        )
      `)
      .eq('interested_user_id', uid)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching sent:', error.message);
      setSent([]);
      return;
    }

    const enriched = await Promise.all(
      (interests || []).map(async (interest) => {
        const { data: offers } = await supabase
          .from('swap_offers')
          .select('*')
          .eq('interest_id', interest.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const offer = offers && offers.length > 0 ? offers[0] : null;

        // Get owner profile
        let ownerProfile = null;
        if (interest.listing) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', interest.listing.user_id)
            .single();
          ownerProfile = profile;
        }

        const listingImages = (interest.listing?.listing_images || []).sort(
          (a, b) => a.display_order - b.display_order
        );
        const targetImage = listingImages[0]?.image_url || null;

        return {
          ...interest,
          offer,
          ownerProfile,
          targetImage,
        };
      })
    );

    setSent(enriched);
  };

  const handleAccept = async (offer, interest) => {
    Alert.alert('Accept this offer?', 'You can always message them to work out the details.', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          const { error } = await supabase
            .from('swap_offers')
            .update({ status: 'accepted' })
            .eq('id', offer.id);

          if (error) {
            Alert.alert('Error', error.message);
          } else {
            // Fetch the other user's payment info
            const otherUserId = interest?.interested_user_id || offer.interest?.interested_user_id;
            if (otherUserId) {
              const { data: otherProfile } = await supabase
                .from('profiles')
                .select('username, payment_venmo, payment_zelle, payment_cashapp')
                .eq('id', otherUserId)
                .single();

              const cashAmount = offer.cash_addition;
              let paymentMsg = 'Swap accepted! Ship your items within 3 days.';
              if (cashAmount > 0 && otherProfile) {
                const methods = [];
                if (otherProfile.payment_venmo) methods.push(`💸 Send $${cashAmount} via Venmo → ${otherProfile.payment_venmo}`);
                if (otherProfile.payment_zelle) methods.push(`💸 Send $${cashAmount} via Zelle → ${otherProfile.payment_zelle}`);
                if (otherProfile.payment_cashapp) methods.push(`💸 Send $${cashAmount} via Cash App → ${otherProfile.payment_cashapp}`);
                if (methods.length > 0) {
                  paymentMsg = `Swap accepted!\n\n@${otherProfile.username} owes you $${cashAmount}:\n\n${methods.join('\n\n')}\n\nShip your items within 3 days.`;
                } else {
                  paymentMsg = `Swap accepted!\n\n@${otherProfile.username} owes you $${cashAmount}.\nAsk them for their payment details.\n\nShip your items within 3 days.`;
                }
              }
              Alert.alert('🎉 It\'s a swap!', paymentMsg);
            } else {
              Alert.alert('Offer accepted!', 'Time to coordinate the swap!');
            }

            // Send push notification to the offerer
            try {
              if (otherUserId) {
                const recipientToken = await getUserPushToken(otherUserId);
                if (recipientToken) {
                  await sendPushNotification(
                    recipientToken,
                    'Offer accepted!',
                    'Your swap offer has been accepted!',
                    { screen: 'SwapInbox' }
                  );
                }
              }
            } catch (notifErr) {
              console.warn('Notification error:', notifErr);
            }

            loadData();
          }
        },
      },
    ]);
  };

  const handleDecline = async (offer, interest) => {
    Alert.alert('Decline this offer?', 'They won\'t be notified why — no hard feelings.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('swap_offers')
            .update({ status: 'declined' })
            .eq('id', offer.id);

          if (error) {
            Alert.alert('Error', error.message);
          } else {
            Alert.alert('Offer declined');

            // Send push notification to the offerer
            try {
              const otherUid = interest?.interested_user_id;
              if (otherUid) {
                const recipientToken = await getUserPushToken(otherUid);
                if (recipientToken) {
                  await sendPushNotification(
                    recipientToken,
                    'Offer update',
                    'Your swap offer was declined',
                    { screen: 'SwapInbox' }
                  );
                }
              }
            } catch (notifErr) {
              console.warn('Notification error:', notifErr);
            }

            loadData();
          }
        },
      },
    ]);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return '#4CAF50';
      case 'declined': return '#EF5350';
      case 'countered': return '#FFA726';
      default: return '#888';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'accepted': return 'Accepted';
      case 'declined': return 'Declined';
      case 'countered': return 'Countered';
      default: return 'Pending';
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  const renderReceivedCard = (item) => {
    const username = item.profile?.display_name || item.profile?.username || 'Someone';
    const listingTitle = item.listing?.title || 'your item';
    const offerStatus = item.offer?.status || 'pending';
    const isPending = offerStatus === 'pending';

    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            {item.profile?.avatar_url ? (
              <Image source={{ uri: item.profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>
                  {(username[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>
              <Text style={styles.usernameHighlight}>{username}</Text>
              {' wants your '}
              <Text style={styles.itemHighlight}>{listingTitle}</Text>
            </Text>
            <Text style={styles.cardTime}>{formatTime(item.created_at)}</Text>
          </View>
        </View>

        {/* Their offered items */}
        {item.offeredListings.length > 0 && (
          <View style={styles.offeredSection}>
            <Text style={styles.offeredLabel}>They're offering:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.offeredScroll}>
              {item.offeredListings.map((ol) => (
                <View key={ol.id} style={styles.offeredItem}>
                  {ol.coverImage ? (
                    <Image source={{ uri: ol.coverImage }} style={styles.offeredImage} />
                  ) : (
                    <View style={[styles.offeredImage, styles.offeredImagePlaceholder]}>
                      <Ionicons name="image-outline" size={16} color={t.textTertiary} />
                    </View>
                  )}
                  <Text style={styles.offeredItemTitle} numberOfLines={1}>{ol.title}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Cash addition */}
        {item.offer?.cash_addition > 0 && (
          <View style={styles.cashBadge}>
            <Ionicons name="cash-outline" size={14} color={t.coral} />
            <Text style={styles.cashBadgeText}>+ ${item.offer.cash_addition} cash</Text>
          </View>
        )}

        {/* Message */}
        {item.offer?.message && (
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>"{item.offer.message}"</Text>
          </View>
        )}

        {/* Status badge or action buttons */}
        {isPending ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => handleDecline(item.offer, item)}
              activeOpacity={0.7}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() =>
                navigation.navigate('CounterOffer', {
                  offer: item.offer,
                  interest: item,
                  myListing: {
                    title: item.listing?.title,
                    targetImage: item.targetImage,
                  },
                })
              }
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={16} color="#FFA726" style={{ marginRight: 4 }} />
              <Text style={styles.counterButtonText}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleAccept(item.offer, item)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={18} color={t.textWhite} style={{ marginRight: 4 }} />
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        ) : offerStatus === 'accepted' ? (
          <TouchableOpacity
            style={styles.shippingButton}
            onPress={() =>
              navigation.navigate('Shipping', {
                offerId: item.offer.id,
                interestId: item.id,
                otherUser: item.profile,
              })
            }
            activeOpacity={0.7}
          >
            <Ionicons name="cube-outline" size={16} color={t.textWhite} style={{ marginRight: 6 }} />
            <Text style={styles.shippingButtonText}>Shipping Details</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.statusBadge, { borderColor: getStatusColor(offerStatus) }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(offerStatus) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(offerStatus) }]}>
              {getStatusLabel(offerStatus)}
            </Text>
          </View>
        )}

        {/* Message button */}
        <TouchableOpacity
          style={styles.messageButton}
          onPress={() =>
            navigation.navigate('SwapChat', {
              interestId: item.id,
              otherUser: item.profile,
            })
          }
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={15} color={t.textTertiary} />
          <Text style={styles.messageButtonText}>Message</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSentCard = (item) => {
    const ownerName = item.ownerProfile?.display_name || item.ownerProfile?.username || 'someone';
    const listingTitle = item.listing?.title || 'an item';
    const offerStatus = item.offer?.status || 'pending';

    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHeader}>
          {item.targetImage ? (
            <Image source={{ uri: item.targetImage }} style={styles.sentItemImage} />
          ) : (
            <View style={[styles.sentItemImage, styles.offeredImagePlaceholder]}>
              <Ionicons name="image-outline" size={20} color={t.textTertiary} />
            </View>
          )}
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>
              {'You offered to swap for '}
              <Text style={styles.itemHighlight}>{listingTitle}</Text>
            </Text>
            <Text style={styles.sentOwner}>from {ownerName}</Text>
            <Text style={styles.cardTime}>{formatTime(item.created_at)}</Text>
          </View>
        </View>

        {item.offer?.cash_addition > 0 && (
          <View style={styles.cashBadge}>
            <Ionicons name="cash-outline" size={14} color={t.coral} />
            <Text style={styles.cashBadgeText}>+ ${item.offer.cash_addition} cash included</Text>
          </View>
        )}

        {offerStatus === 'accepted' ? (
          <TouchableOpacity
            style={styles.shippingButton}
            onPress={() =>
              navigation.navigate('Shipping', {
                offerId: item.offer.id,
                interestId: item.id,
                otherUser: item.ownerProfile,
              })
            }
            activeOpacity={0.7}
          >
            <Ionicons name="cube-outline" size={16} color={t.textWhite} style={{ marginRight: 6 }} />
            <Text style={styles.shippingButtonText}>Shipping Details</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.statusBadge, { borderColor: getStatusColor(offerStatus) }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(offerStatus) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(offerStatus) }]}>
              {getStatusLabel(offerStatus)}
            </Text>
          </View>
        )}

        {/* Message button */}
        <TouchableOpacity
          style={styles.messageButton}
          onPress={() =>
            navigation.navigate('SwapChat', {
              interestId: item.id,
              otherUser: item.ownerProfile,
            })
          }
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={15} color={t.textTertiary} />
          <Text style={styles.messageButtonText}>Message</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = (type) => (
    <View style={styles.emptyState}>
      <Ionicons
        name={type === 'received' ? 'mail-open-outline' : 'paper-plane-outline'}
        size={48}
        color={t.textTertiary}
      />
      <Text style={styles.emptyTitle}>
        {type === 'received' ? 'No offers yet' : 'No offers sent'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {type === 'received'
          ? 'When someone wants to swap with you, it\'ll show up here'
          : 'Browse listings and propose a swap to get started'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Swap Requests</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setActiveTab('received')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
            Received
          </Text>
          {received.filter((r) => r.offer?.status === 'pending').length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>
                {received.filter((r) => r.offer?.status === 'pending').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setActiveTab('sent')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
            Sent
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF6B6B"
            colors={['#FF6B6B']}
          />
        }
      >
        {activeTab === 'received' ? (
          received.length > 0
            ? received.map(renderReceivedCard)
            : renderEmptyState('received')
        ) : (
          sent.length > 0
            ? sent.map(renderSentCard)
            : renderEmptyState('sent')
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: t.background,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: t.text,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginRight: 28,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#FF6B6B',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: t.textTertiary,
  },
  tabTextActive: {
    color: t.text,
  },
  tabBadge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: t.text,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Cards
  card: {
    backgroundColor: t.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: t.separator,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarPlaceholder: {
    backgroundColor: '#FF6B6B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    color: t.textSecondary,
    lineHeight: 22,
  },
  usernameHighlight: {
    fontWeight: '700',
    color: t.text,
  },
  itemHighlight: {
    fontWeight: '700',
    color: '#FF6B6B',
  },
  cardTime: {
    fontSize: 12,
    color: t.textTertiary,
    marginTop: 3,
  },
  sentOwner: {
    fontSize: 13,
    color: t.textTertiary,
    marginTop: 2,
  },
  sentItemImage: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginRight: 12,
  },

  // Offered items
  offeredSection: {
    marginTop: 14,
  },
  offeredLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: t.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  offeredScroll: {
    flexDirection: 'row',
  },
  offeredItem: {
    marginRight: 10,
    width: 72,
  },
  offeredImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  offeredImagePlaceholder: {
    backgroundColor: t.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offeredItemTitle: {
    fontSize: 11,
    color: t.textTertiary,
    marginTop: 4,
  },

  // Cash badge
  cashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B15',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
    gap: 6,
  },
  cashBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B6B',
  },

  // Message
  messageContainer: {
    marginTop: 12,
    backgroundColor: t.background,
    borderRadius: 10,
    padding: 12,
  },
  messageText: {
    fontSize: 14,
    color: t.textTertiary,
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: t.textTertiary,
  },
  acceptButton: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: '#FF6B6B',
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: t.text,
  },
  counterButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#FFA72640',
  },
  counterButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFA726',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  messageButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: t.textTertiary,
  },

  // Shipping button
  shippingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  shippingButtonText: {
    color: t.text,
    fontSize: 15,
    fontWeight: '700',
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 14,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: t.textTertiary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: t.textTertiary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
