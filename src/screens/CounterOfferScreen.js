import React, { useState, useEffect } from 'react';
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

const { width } = Dimensions.get('window');
const GRID_GAP = 10;
const GRID_PADDING = 20;
const NUM_COLUMNS = 3;
const ITEM_SIZE = (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function CounterOfferScreen({ navigation, route }) {
  const { offer, interest, myListing } = route.params;

  const [theirListings, setTheirListings] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [message, setMessage] = useState('');
  const [cashAmount, setCashAmount] = useState(
    offer.cash_addition ? String(offer.cash_addition) : ''
  );
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [originalOfferedListings, setOriginalOfferedListings] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Fetch original offered listing details
      if (offer.offered_listing_ids && offer.offered_listing_ids.length > 0) {
        const { data: origListings } = await supabase
          .from('listings')
          .select('id, title, brand, size, listing_images(image_url, display_order)')
          .in('id', offer.offered_listing_ids);

        const withImages = (origListings || []).map((l) => {
          const images = (l.listing_images || []).sort(
            (a, b) => a.display_order - b.display_order
          );
          return { ...l, coverImage: images[0]?.image_url || null };
        });
        setOriginalOfferedListings(withImages);
      }

      // Fetch User A's (the interested user's) active listings for browsing
      const theirUserId = interest.interested_user_id;
      const { data: listings, error } = await supabase
        .from('listings')
        .select('*, listing_images(image_url, display_order)')
        .eq('user_id', theirUserId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const withImages = (listings || []).map((l) => {
        const images = (l.listing_images || []).sort(
          (a, b) => a.display_order - b.display_order
        );
        return { ...l, coverImage: images[0]?.image_url || null };
      });

      setTheirListings(withImages);
    } catch (err) {
      console.warn('Error loading counter offer data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSendCounter = async () => {
    if (selectedIds.length === 0) {
      Alert.alert('Select items', 'Pick at least one item from their closet you\'d prefer.');
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

      const parsedCash = cashAmount.trim() ? parseFloat(cashAmount) || 0 : 0;

      // 1. Update old offer status to 'countered'
      const { error: updateError } = await supabase
        .from('swap_offers')
        .update({ status: 'countered' })
        .eq('id', offer.id);

      if (updateError) throw updateError;

      // 2. Create new swap_offer linked to the same interest
      const { error: insertError } = await supabase
        .from('swap_offers')
        .insert({
          interest_id: interest.id,
          offered_listing_ids: selectedIds,
          cash_addition: parsedCash,
          status: 'pending',
          message: message.trim() || null,
        });

      if (insertError) throw insertError;

      Alert.alert(
        'Counter sent!',
        'They\'ll see your counter-offer in their inbox.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Something went wrong', err.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const renderMyListingCard = () => {
    if (!myListing) return null;
    return (
      <View style={styles.targetCard}>
        {myListing.targetImage ? (
          <Image source={{ uri: myListing.targetImage }} style={styles.targetImage} />
        ) : (
          <View style={[styles.targetImage, styles.placeholderImage]}>
            <Ionicons name="image-outline" size={24} color="#555" />
          </View>
        )}
        <View style={styles.targetInfo}>
          <Text style={styles.targetTitle} numberOfLines={2}>
            {myListing.title || interest.listing?.title || 'Your item'}
          </Text>
          <Text style={styles.targetMeta}>Your listing they want</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Counter Offer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Your listing they want */}
        <Text style={styles.sectionLabel}>They want your item</Text>
        {renderMyListingCard()}

        {/* Their original offer */}
        <Text style={styles.sectionLabel}>Their original offer</Text>
        {originalOfferedListings.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.originalScroll}
          >
            {originalOfferedListings.map((ol) => (
              <View key={ol.id} style={styles.originalItem}>
                {ol.coverImage ? (
                  <Image source={{ uri: ol.coverImage }} style={styles.originalImage} />
                ) : (
                  <View style={[styles.originalImage, styles.placeholderImage]}>
                    <Ionicons name="image-outline" size={16} color="#555" />
                  </View>
                )}
                <Text style={styles.originalItemTitle} numberOfLines={1}>
                  {ol.title}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noItemsText}>No items in original offer</Text>
        )}

        {offer.cash_addition > 0 && (
          <View style={styles.originalCash}>
            <Ionicons name="cash-outline" size={14} color="#FFA726" />
            <Text style={styles.originalCashText}>
              + ${offer.cash_addition} cash offered
            </Text>
          </View>
        )}

        {/* Pick different items from their closet */}
        <Text style={styles.sectionLabel}>Pick different items from their closet</Text>
        <Text style={styles.sectionHint}>
          {selectedIds.length === 0
            ? 'Tap to select items you\'d prefer instead'
            : `${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''} selected`}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#FF6B6B" style={{ marginTop: 30 }} />
        ) : theirListings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shirt-outline" size={40} color="#333" />
            <Text style={styles.emptyText}>Their closet is empty</Text>
            <Text style={styles.emptySubtext}>
              No other active listings to choose from
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {theirListings.map((item) => {
              const isSelected = selectedIds.includes(item.id);
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
                      <Ionicons name="image-outline" size={20} color="#555" />
                    </View>
                  )}
                  {isSelected && (
                    <View style={styles.checkOverlay}>
                      <View style={styles.checkCircle}>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </View>
                    </View>
                  )}
                  <Text style={styles.gridTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.gridMeta} numberOfLines={1}>
                    {[item.brand, item.size].filter(Boolean).join(' · ')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Cash adjustment */}
        <Text style={styles.sectionLabel}>Adjust cash amount</Text>
        <View style={styles.cashInputWrapper}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.cashInput}
            placeholder="0"
            placeholderTextColor="#555"
            keyboardType="numeric"
            value={cashAmount}
            onChangeText={setCashAmount}
          />
        </View>

        {/* Message */}
        <Text style={styles.sectionLabel}>Add a note</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          placeholder="Explain your counter-offer..."
          placeholderTextColor="#555"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            (sending || selectedIds.length === 0) && styles.sendButtonDisabled,
          ]}
          onPress={handleSendCounter}
          activeOpacity={0.8}
          disabled={sending || selectedIds.length === 0}
        >
          <Ionicons
            name="swap-horizontal-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.sendButtonText}>
            {sending ? 'Sending...' : 'Send Counter'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
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
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Section labels
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionHint: {
    fontSize: 13,
    color: '#FF6B6B',
    marginTop: -8,
    marginBottom: 12,
    fontWeight: '500',
  },

  // Target card (your listing they want)
  targetCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  targetImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  targetInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  targetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  targetMeta: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },

  placeholderImage: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Original offer
  originalScroll: {
    flexDirection: 'row',
  },
  originalItem: {
    marginRight: 10,
    width: 80,
  },
  originalImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  originalItemTitle: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  originalCash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  originalCashText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFA726',
  },
  noItemsText: {
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
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
  gridTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ddd',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  gridMeta: {
    fontSize: 11,
    color: '#666',
    paddingHorizontal: 2,
    marginTop: 1,
  },

  // Cash input
  cashInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: '600',
    color: '#777',
    marginRight: 4,
  },
  cashInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },

  // Input
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  messageInput: {
    minHeight: 80,
    paddingTop: 14,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#444',
    marginTop: 4,
  },

  // Send button
  sendButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 32,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
