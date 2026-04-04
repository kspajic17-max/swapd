import React, { useState, useEffect, useMemo } import { t } from '../app/theme';
import 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { sendPushNotification, getUserPushToken } from '../lib/notifications';

const { width } = Dimensions.get('window');
const GRID_GAP = 10;
const GRID_PADDING = 20;
const NUM_COLUMNS = 3;
const ITEM_SIZE = (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

/**
 * Score a user's item against the target listing to determine trade compatibility.
 * Higher score = better match.
 */
function scoreItem(myItem, targetListing, ownerLookingFor) {
  let score = 0;

  const myValue = Number(myItem.estimated_value) || 0;
  const theirValue = Number(targetListing.estimated_value) || 0;
  const mySize = (myItem.size || '').toLowerCase();
  const theirSize = (targetListing.size || '').toLowerCase();
  const myCategory = (myItem.category || '').toLowerCase();
  const theirCategory = (targetListing.category || '').toLowerCase();
  const myBrand = (myItem.brand || '').toLowerCase();
  const theirBrand = (targetListing.brand || '').toLowerCase();
  const myTags = (myItem.tags || []).map((t) => t.toLowerCase());
  const theirTags = (targetListing.tags || []).map((t) => t.toLowerCase());

  // Value proximity
  if (myValue > 0 && theirValue > 0) {
    const ratio = Math.min(myValue, theirValue) / Math.max(myValue, theirValue);
    if (ratio >= 0.75) score += 3;
    else if (ratio >= 0.5) score += 2;
  }

  // Category match
  if (myCategory && myCategory === theirCategory) score += 2;

  // Size match (same size string = same size type)
  if (mySize && mySize === theirSize) score += 2;

  // Brand match
  if (myBrand && myBrand === theirBrand) score += 2;

  // Vibe tag overlap
  myTags.forEach((tag) => {
    if (theirTags.includes(tag)) score += 1;
  });

  // Owner's looking_for mentions item's category/brand/title words
  if (ownerLookingFor) {
    const lfWords = ownerLookingFor
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter((w) => w.length > 2);
    const myTitle = (myItem.title || '').toLowerCase();
    const hasMatch = lfWords.some(
      (w) => myCategory.includes(w) || myBrand.includes(w) || myTitle.includes(w)
    );
    if (hasMatch) score += 2;
  }

  return score;
}

export default function SwapOfferScreen({ navigation, route }) {
  const { listing, preSelectedItemId } = route.params;

  const [myListings, setMyListings] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [message, setMessage] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [targetImage, setTargetImage] = useState(null);
  const [ownerLookingFor, setOwnerLookingFor] = useState('');
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  useEffect(() => {
    fetchMyListings();
    fetchTargetImage();
    fetchOwnerProfile();
  }, []);

  const fetchTargetImage = async () => {
    const { data } = await supabase
      .from('listing_images')
      .select('image_url')
      .eq('listing_id', listing.id)
      .order('display_order', { ascending: true })
      .limit(1);
    if (data && data.length > 0) {
      setTargetImage(data[0].image_url);
    }
  };

  const fetchOwnerProfile = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('looking_for')
        .eq('id', listing.user_id)
        .single();
      if (data?.looking_for) {
        setOwnerLookingFor(data.looking_for);
      }
    } catch (err) {
      // non-critical
    }
  };

  const fetchMyListings = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const userId = sessionData.session.user.id;

      const { data: listings, error } = await supabase
        .from('listings')
        .select('*, listing_images(image_url, display_order)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const withImages = (listings || []).map((l) => {
        const images = (l.listing_images || []).sort(
          (a, b) => a.display_order - b.display_order
        );
        return { ...l, coverImage: images[0]?.image_url || null };
      });

      setMyListings(withImages);
    } catch (err) {
      console.warn('Error fetching listings:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Score and partition items into recommended vs rest
  const { recommended, rest, scoredMap } = useMemo(() => {
    if (myListings.length === 0) {
      return { recommended: [], rest: [], scoredMap: {} };
    }

    const scored = myListings.map((item) => ({
      ...item,
      _score: scoreItem(item, listing, ownerLookingFor),
    }));

    // Sort by score descending
    scored.sort((a, b) => b._score - a._score);

    const map = {};
    scored.forEach((item) => {
      map[item.id] = item._score;
    });

    // If there's a preSelectedItemId, don't split into recommended section
    // (the preselected item is handled separately)
    if (preSelectedItemId) {
      return { recommended: [], rest: scored, scoredMap: map };
    }

    // Top 1-2 items with score >= 3
    const rec = scored.filter((item) => item._score >= 3).slice(0, 2);
    const recIds = new Set(rec.map((r) => r.id));
    const remaining = scored.filter((item) => !recIds.has(item.id));

    return { recommended: rec, rest: remaining, scoredMap: map };
  }, [myListings, listing, ownerLookingFor, preSelectedItemId]);

  // Auto-select: run once after items are scored
  useEffect(() => {
    if (hasAutoSelected || loading || myListings.length === 0) return;

    if (preSelectedItemId) {
      // Pre-select the item passed from "Offer This"
      setSelectedIds([preSelectedItemId]);
    } else if (recommended.length > 0) {
      // Pre-select recommended items
      setSelectedIds(recommended.map((r) => r.id));
    }
    setHasAutoSelected(true);
  }, [loading, myListings, recommended, preSelectedItemId, hasAutoSelected]);

  // Auto-fill cash amount based on value gap
  useEffect(() => {
    if (!hasAutoSelected) return;
    const theirValue = Number(listing.estimated_value) || 0;
    if (theirValue <= 0) return;

    const myTotal = selectedIds.reduce((sum, id) => {
      const item = myListings.find((l) => l.id === id);
      return sum + (Number(item?.estimated_value) || 0);
    }, 0);

    if (myTotal > 0 && theirValue > myTotal) {
      const gap = Math.round(theirValue - myTotal);
      setCashAmount(String(gap));
    } else {
      setCashAmount('');
    }
  }, [selectedIds, hasAutoSelected]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Value calculations
  const myTotal = useMemo(() => {
    return selectedIds.reduce((sum, id) => {
      const item = myListings.find((l) => l.id === id);
      return sum + (Number(item?.estimated_value) || 0);
    }, 0);
  }, [selectedIds, myListings]);

  const theirValue = Number(listing.estimated_value) || 0;
  const parsedCash = Number(cashAmount) || 0;
  const valueDiff = theirValue - (myTotal + parsedCash);

  const handleSend = async () => {
    if (selectedIds.length === 0) {
      Alert.alert('Select items', 'Pick at least one item from your closet to offer.');
      return;
    }

    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        Alert.alert('Error', 'You must be logged in.');
        setSending(false);
        return;
      }

      const userId = sessionData.session.user.id;

      // 1. Create swap_interest
      const { data: interest, error: interestError } = await supabase
        .from('swap_interests')
        .insert({
          interested_user_id: userId,
          listing_id: listing.id,
          message: message.trim() || null,
          status: 'pending',
        })
        .select()
        .single();

      if (interestError) throw interestError;

      // 2. Create swap_offer
      const finalCash = cashAmount.trim() ? parseFloat(cashAmount) || 0 : 0;

      const { error: offerError } = await supabase
        .from('swap_offers')
        .insert({
          interest_id: interest.id,
          offered_listing_ids: selectedIds,
          cash_addition: finalCash,
          status: 'pending',
          message: message.trim() || null,
        });

      if (offerError) throw offerError;

      // Send push notification to the listing owner
      try {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', userId)
          .single();

        const recipientToken = await getUserPushToken(listing.user_id);
        if (recipientToken) {
          const senderUsername = senderProfile?.username || 'Someone';
          await sendPushNotification(
            recipientToken,
            'New swap offer!',
            `@${senderUsername} wants to swap for your ${listing.title}`,
            { screen: 'SwapInbox' }
          );
        }
      } catch (notifErr) {
        console.warn('Notification error:', notifErr);
      }

      Alert.alert(
        'Offer sent!',
        'They\'ll be notified — fingers crossed!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Something went wrong', err.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const getBadgeLabel = (score) => {
    if (score >= 6) return 'Best match';
    return 'Good match';
  };

  const renderItemCard = (item, options = {}) => {
    const isSelected = selectedIds.includes(item.id);
    const { showBadge, badgeLabel } = options;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.gridItem, isSelected && styles.gridItemSelected]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.7}
      >
        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.placeholderImage]}>
            <Ionicons name="image-outline" size={20} color={t.textTertiary} />
          </View>
        )}
        {isSelected && (
          <View style={styles.checkOverlay}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={18} color={t.textWhite} />
            </View>
          </View>
        )}
        {showBadge && badgeLabel && (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>{badgeLabel}</Text>
          </View>
        )}
        <Text style={styles.gridTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.gridMeta} numberOfLines={1}>
          {[item.brand, item.size].filter(Boolean).join(' · ')}
        </Text>
        {item.estimated_value ? (
          <Text style={styles.gridValue}>~${Number(item.estimated_value).toFixed(0)}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const showCashSection = theirValue > 0 && myTotal > 0 && theirValue > myTotal;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={t.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Propose a Swap</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* "You want" card — compact */}
        <Text style={styles.sectionLabel}>You want</Text>
        <View style={styles.targetCard}>
          {targetImage ? (
            <Image source={{ uri: targetImage }} style={styles.targetImage} />
          ) : (
            <View style={[styles.targetImage, styles.placeholderImage]}>
              <Ionicons name="image-outline" size={24} color={t.textTertiary} />
            </View>
          )}
          <View style={styles.targetInfo}>
            <Text style={styles.targetTitle} numberOfLines={1}>{listing.title}</Text>
            <View style={styles.targetMeta}>
              {listing.brand && (
                <Text style={styles.targetMetaText}>{listing.brand}</Text>
              )}
              {listing.brand && listing.size && <View style={styles.metaDot} />}
              {listing.size && (
                <Text style={styles.targetMetaText}>{listing.size}</Text>
              )}
            </View>
            {theirValue > 0 && (
              <Text style={styles.targetValue}>~${theirValue}</Text>
            )}
          </View>
        </View>

        {/* Value comparison bar */}
        {selectedIds.length > 0 && theirValue > 0 && (
          <View style={styles.valueBar}>
            <View style={styles.valueBarSide}>
              <Text style={styles.valueBarLabel}>Your items</Text>
              <Text style={styles.valueBarAmount}>${myTotal}</Text>
            </View>
            <View style={styles.valueBarCenter}>
              <Ionicons name="swap-horizontal" size={18} color={t.textTertiary} />
            </View>
            <View style={[styles.valueBarSide, { alignItems: 'flex-end' }]}>
              <Text style={styles.valueBarLabel}>Their item</Text>
              <Text style={styles.valueBarAmount}>${theirValue}</Text>
            </View>
          </View>
        )}
        {selectedIds.length > 0 && theirValue > 0 && valueDiff !== 0 && (
          <View style={styles.diffRow}>
            <Text style={[styles.diffText, valueDiff > 0 ? styles.diffNegative : styles.diffPositive]}>
              {valueDiff > 0
                ? `Gap: $${Math.round(valueDiff)}`
                : valueDiff < 0
                  ? `You're offering $${Math.round(Math.abs(valueDiff))} over`
                  : 'Even trade'}
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={t.coral} style={{ marginTop: 30 }} />
        ) : myListings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shirt-outline" size={40} color={t.textTertiary} />
            <Text style={styles.emptyText}>Your closet is empty</Text>
            <Text style={styles.emptySubtext}>List some items first to start swapping</Text>
          </View>
        ) : (
          <>
            {/* Recommended section */}
            {recommended.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Recommended for this trade</Text>
                <Text style={styles.sectionHint}>
                  We picked these based on value, size, and style match
                </Text>
                <View style={styles.grid}>
                  {recommended.map((item) =>
                    renderItemCard(item, {
                      showBadge: true,
                      badgeLabel: getBadgeLabel(item._score),
                    })
                  )}
                </View>
              </>
            )}

            {/* Rest of closet */}
            <Text style={styles.sectionLabel}>
              {recommended.length > 0 ? 'Or pick from your closet' : 'Pick from your closet'}
            </Text>
            {!preSelectedItemId && recommended.length === 0 && (
              <Text style={styles.sectionHint}>
                {selectedIds.length === 0
                  ? 'Tap to select items you\'d like to offer'
                  : `${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''} selected`}
              </Text>
            )}
            {preSelectedItemId && (
              <Text style={styles.sectionHint}>
                {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
              </Text>
            )}
            <View style={styles.grid}>
              {rest.map((item) => {
                const isPreSelected = item.id === preSelectedItemId;
                return renderItemCard(item, {
                  showBadge: isPreSelected,
                  badgeLabel: isPreSelected ? 'Your pick' : null,
                });
              })}
            </View>
          </>
        )}

        {/* Cash addition — only when value gap exists */}
        {showCashSection && (
          <View style={styles.cashSection}>
            <View style={styles.cashHeader}>
              <Ionicons name="cash-outline" size={20} color={t.coral} />
              <Text style={styles.cashTitle}>Add cash to even it out</Text>
            </View>
            <Text style={styles.cashHint}>
              Add ${Math.round(theirValue - myTotal)} to even out the values
            </Text>
            <View style={styles.cashInputWrapper}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.cashInput}
                placeholder="0"
                placeholderTextColor={t.textTertiary}
                keyboardType="numeric"
                value={cashAmount}
                onChangeText={setCashAmount}
              />
            </View>
          </View>
        )}

        {/* Optional message — compact */}
        <Text style={styles.sectionLabel}>Add a note</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          placeholder="Say something nice..."
          placeholderTextColor={t.textTertiary}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />

        {/* Spacer for fixed bottom button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed "Send Offer" button at bottom */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.sendButton, (sending || selectedIds.length === 0) && styles.sendButtonDisabled]}
          onPress={handleSend}
          activeOpacity={0.8}
          disabled={sending || selectedIds.length === 0}
        >
          <Ionicons name="paper-plane-outline" size={20} color={t.textWhite} style={{ marginRight: 8 }} />
          <Text style={styles.sendButtonText}>
            {sending
              ? 'Sending...'
              : selectedIds.length === 0
                ? 'Select items to offer'
                : parsedCash > 0
                  ? `Send Offer  ·  ${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''} + $${parsedCash}`
                  : `Send Offer  ·  ${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: t.background,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: t.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Section labels
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: t.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionHint: {
    fontSize: 13,
    color: t.textTertiary,
    marginTop: -6,
    marginBottom: 12,
    fontWeight: '500',
  },

  // Target listing card — compact
  targetCard: {
    flexDirection: 'row',
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: t.separator,
  },
  targetImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  targetInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  targetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: t.text,
    marginBottom: 2,
  },
  targetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  targetMetaText: {
    fontSize: 12,
    color: t.textTertiary,
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#555',
    marginHorizontal: 6,
  },
  targetValue: {
    fontSize: 13,
    color: '#FF6B6B',
    fontWeight: '600',
    marginTop: 2,
  },

  placeholderImage: {
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Value comparison bar
  valueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: t.separator,
  },
  valueBarSide: {
    flex: 1,
  },
  valueBarCenter: {
    paddingHorizontal: 12,
  },
  valueBarLabel: {
    fontSize: 11,
    color: t.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  valueBarAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: t.text,
  },
  diffRow: {
    alignItems: 'center',
    marginTop: 6,
  },
  diffText: {
    fontSize: 12,
    fontWeight: '600',
  },
  diffNegative: {
    color: '#FF6B6B',
  },
  diffPositive: {
    color: '#4CAF50',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gridItemSelected: {
    borderColor: '#FF6B6B',
  },
  gridImage: {
    width: '100%',
    height: ITEM_SIZE,
    borderRadius: 10,
  },
  checkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: ITEM_SIZE,
    backgroundColor: 'rgba(255, 107, 107, 0.25)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchBadge: {
    position: 'absolute',
    top: 6,
    left: 4,
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  matchBadgeText: {
    color: t.text,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  gridTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: t.textSecondary,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  gridMeta: {
    fontSize: 11,
    color: t.textTertiary,
    paddingHorizontal: 2,
    marginTop: 1,
  },
  gridValue: {
    fontSize: 11,
    color: '#FF6B6B',
    fontWeight: '600',
    paddingHorizontal: 2,
    marginTop: 1,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: t.textTertiary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: t.textTertiary,
    marginTop: 4,
  },

  // Input
  input: {
    backgroundColor: t.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: t.text,
    borderWidth: 1,
    borderColor: t.separator,
  },
  messageInput: {
    minHeight: 56,
    paddingTop: 12,
  },

  // Cash section
  cashSection: {
    marginTop: 22,
    backgroundColor: t.cardAlt,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF6B6B30',
  },
  cashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  cashTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: t.text,
  },
  cashHint: {
    fontSize: 13,
    color: t.textTertiary,
    marginBottom: 12,
    marginLeft: 28,
  },
  cashInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.separator,
    paddingHorizontal: 14,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: '600',
    color: t.textTertiary,
    marginRight: 4,
  },
  cashInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: t.text,
  },

  // Fixed bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    backgroundColor: t.background,
    borderTopWidth: 1,
    borderTopColor: t.separator,
  },
  sendButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: t.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
