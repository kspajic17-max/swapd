import React, { useState, useCallback } from 'react';
import { t } from '../app/theme';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

const NOTIFICATION_TYPES = {
  SWAP_INTEREST: 'swap_interest',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_DECLINED: 'offer_declined',
  OFFER_COUNTERED: 'offer_countered',
  MESSAGE: 'message',
};

const TYPE_CONFIG = {
  [NOTIFICATION_TYPES.SWAP_INTEREST]: {
    icon: 'swap-horizontal',
    color: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  [NOTIFICATION_TYPES.OFFER_ACCEPTED]: {
    icon: 'checkmark-circle',
    color: '#4CAF50',
    borderColor: '#4CAF50',
  },
  [NOTIFICATION_TYPES.OFFER_DECLINED]: {
    icon: 'close-circle',
    color: '#EF5350',
    borderColor: '#EF5350',
  },
  [NOTIFICATION_TYPES.OFFER_COUNTERED]: {
    icon: 'repeat',
    color: '#FFA726',
    borderColor: '#FFA726',
  },
  [NOTIFICATION_TYPES.MESSAGE]: {
    icon: 'chatbubble',
    color: '#42A5F5',
    borderColor: '#42A5F5',
  },
};

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [])
  );

  const loadNotifications = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      const uid = sessionData.session.user.id;

      const items = [];

      // 1. Incoming swap interests on my listings
      const { data: myListings } = await supabase
        .from('listings')
        .select('id, title')
        .eq('user_id', uid);

      if (myListings && myListings.length > 0) {
        const myListingIds = myListings.map((l) => l.id);
        const listingMap = {};
        myListings.forEach((l) => { listingMap[l.id] = l.title; });

        const { data: interests } = await supabase
          .from('swap_interests')
          .select(`
            id, listing_id, created_at,
            profile:profiles!swap_interests_interested_user_id_fkey(username, display_name)
          `)
          .in('listing_id', myListingIds)
          .order('created_at', { ascending: false })
          .limit(30);

        if (interests) {
          interests.forEach((interest) => {
            const username = interest.profile?.display_name || interest.profile?.username || 'Someone';
            const listingTitle = listingMap[interest.listing_id] || 'your item';
            items.push({
              id: `interest_${interest.id}`,
              type: NOTIFICATION_TYPES.SWAP_INTEREST,
              text: `@${username} wants to swap for your ${listingTitle}`,
              created_at: interest.created_at,
              interestId: interest.id,
              otherUser: interest.profile,
            });
          });
        }
      }

      // 2. Offer status changes on my sent interests
      const { data: myInterests } = await supabase
        .from('swap_interests')
        .select('id')
        .eq('interested_user_id', uid);

      if (myInterests && myInterests.length > 0) {
        const myInterestIds = myInterests.map((i) => i.id);

        const { data: offers } = await supabase
          .from('swap_offers')
          .select(`
            id, interest_id, status, created_at,
            interest:swap_interests!inner(
              listing_id,
              listing:listings(title, user_id)
            )
          `)
          .in('interest_id', myInterestIds)
          .in('status', ['accepted', 'declined', 'countered'])
          .order('created_at', { ascending: false })
          .limit(30);

        if (offers) {
          for (const offer of offers) {
            const listingTitle = offer.interest?.listing?.title || 'your offer';
            const ownerId = offer.interest?.listing?.user_id;

            let ownerUsername = 'Someone';
            if (ownerId) {
              const { data: ownerProfile } = await supabase
                .from('profiles')
                .select('username, display_name')
                .eq('id', ownerId)
                .single();
              if (ownerProfile) {
                ownerUsername = ownerProfile.display_name || ownerProfile.username || 'Someone';
              }
            }

            let type;
            let text;
            if (offer.status === 'accepted') {
              type = NOTIFICATION_TYPES.OFFER_ACCEPTED;
              text = `@${ownerUsername} accepted your offer for ${listingTitle}!`;
            } else if (offer.status === 'declined') {
              type = NOTIFICATION_TYPES.OFFER_DECLINED;
              text = `@${ownerUsername} declined your offer for ${listingTitle}`;
            } else if (offer.status === 'countered') {
              type = NOTIFICATION_TYPES.OFFER_COUNTERED;
              text = `@${ownerUsername} countered your offer for ${listingTitle}`;
            }

            if (type) {
              items.push({
                id: `offer_${offer.id}`,
                type,
                text,
                created_at: offer.created_at,
                interestId: offer.interest_id,
              });
            }
          }
        }
      }

      // 3. Messages from other users
      // Collect all interest IDs the user is part of (sent + received)
      const allInterestIds = new Set();
      if (myInterests) myInterests.forEach((i) => allInterestIds.add(i.id));
      if (myListings && myListings.length > 0) {
        const myListingIds = myListings.map((l) => l.id);
        const { data: receivedInterests } = await supabase
          .from('swap_interests')
          .select('id')
          .in('listing_id', myListingIds);
        if (receivedInterests) {
          receivedInterests.forEach((i) => allInterestIds.add(i.id));
        }
      }

      if (allInterestIds.size > 0) {
        const { data: msgs } = await supabase
          .from('messages')
          .select(`
            id, interest_id, content, created_at,
            sender:profiles!messages_sender_id_fkey(username, display_name)
          `)
          .in('interest_id', Array.from(allInterestIds))
          .neq('sender_id', uid)
          .order('created_at', { ascending: false })
          .limit(30);

        if (msgs) {
          msgs.forEach((msg) => {
            const senderName = msg.sender?.display_name || msg.sender?.username || 'Someone';
            const preview = msg.content.length > 40
              ? msg.content.substring(0, 40) + '...'
              : msg.content;
            items.push({
              id: `msg_${msg.id}`,
              type: NOTIFICATION_TYPES.MESSAGE,
              text: `@${senderName} sent you a message: "${preview}"`,
              created_at: msg.created_at,
              interestId: msg.interest_id,
              otherUser: msg.sender,
            });
          });
        }
      }

      // Sort by created_at descending
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setNotifications(items);
    } catch (err) {
      console.warn('Error loading notifications:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleTap = (item) => {
    if (item.interestId) {
      navigation.navigate('Swaps', {
        screen: 'SwapChat',
        params: {
          interestId: item.interestId,
          otherUser: item.otherUser || null,
        },
      });
    }
  };

  const renderItem = ({ item }) => {
    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG[NOTIFICATION_TYPES.MESSAGE];

    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: config.borderColor }]}
        onPress={() => handleTap(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon} size={20} color={config.color} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardText}>{item.text}</Text>
          <Text style={styles.cardTime}>{formatRelativeTime(item.created_at)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.emptyListContent,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF6B6B"
            colors={['#FF6B6B']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={48} color={t.textTertiary} />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySubtitle}>
              When someone interacts with your listings or sends you a message, it will show up here
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: t.separator,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    marginRight: 8,
  },
  cardText: {
    fontSize: 14,
    color: t.textSecondary,
    lineHeight: 20,
  },
  cardTime: {
    fontSize: 12,
    color: t.textTertiary,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
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
