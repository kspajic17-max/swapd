import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { t } from '../app/theme';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  StatusBar,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_WIDTH * 1.05;

const CONDITION_LABELS = {
  new_with_tags: 'New with Tags',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const TAG_LABELS = {
  going_out: 'Going Out',
  casual: 'Casual',
  brunch: 'Brunch',
  party: 'Party',
  vacation: 'Vacation',
  streetwear: 'Streetwear',
  y2k: 'Y2K',
  vintage: 'Vintage',
  cottagecore: 'Cottagecore',
  minimalist: 'Minimalist',
  sporty: 'Sporty',
  festival: 'Festival',
};

export default function ListingDetailScreen({ route, navigation }) {
  const { listingId } = route.params;
  const [listing, setListing] = useState(null);
  const [images, setImages] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [myClosetItems, setMyClosetItems] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchListing();
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      setCurrentUserId(data.session.user.id);
      fetchMyCloset(data.session.user.id);
    }
  };

  const fetchMyCloset = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(image_url, display_order)')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching my closet:', error);
        return;
      }

      const processed = (data || []).map((item) => {
        const imgs = (item.listing_images || []).sort(
          (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
        );
        const coverImage = imgs.length > 0 ? imgs[0].image_url : null;
        return { ...item, coverImage };
      });

      setMyClosetItems(processed);
    } catch (err) {
      console.error('Error fetching my closet:', err);
    }
  };

  const fetchListing = async () => {
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*, profiles(id, username, display_name, avatar_url, location, looking_for, open_to_brands, not_interested_in), listing_images(id, image_url, display_order)')
        .eq('id', listingId)
        .single();

      if (error) {
        console.error('Error fetching listing:', error);
        Alert.alert('Error', 'Could not load listing.');
        navigation.goBack();
        return;
      }

      const imgs = (data.listing_images || []).sort(
        (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
      );

      setListing(data);
      setImages(imgs);
      setProfile(data.profiles);
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentImageIndex(index);
  };

  const isOwnListing = currentUserId && listing?.user_id === currentUserId;

  // Compute suggested trades from current user's closet for this listing
  const suggestedTrades = useMemo(() => {
    if (!listing || !currentUserId || isOwnListing || myClosetItems.length === 0) return [];

    const theirValue = Number(listing.estimated_value) || 0;
    const theirSize = (listing.size || '').toLowerCase();
    const theirCategory = (listing.category || '').toLowerCase();
    const theirTags = (listing.tags || []).map((t) => t.toLowerCase());
    const theirBrand = (listing.brand || '').toLowerCase();
    const theirLookingFor = (listing.profiles?.looking_for || '').toLowerCase();

    const scored = myClosetItems.map((myItem) => {
      let score = 0;
      const myValue = Number(myItem.estimated_value) || 0;
      const mySize = (myItem.size || '').toLowerCase();
      const myCategory = (myItem.category || '').toLowerCase();
      const myTags = (myItem.tags || []).map((t) => t.toLowerCase());

      // Size match
      if (mySize && mySize === theirSize) score += 3;

      // Category match
      if (myCategory && myCategory === theirCategory) score += 3;

      // Tag overlap
      myTags.forEach((tag) => {
        if (theirTags.includes(tag)) score += 2;
      });

      // Value proximity
      if (myValue > 0 && theirValue > 0) {
        const ratio = myValue > theirValue ? theirValue / myValue : myValue / theirValue;
        if (ratio >= 0.75) score += 3;
        else if (ratio >= 0.5) score += 1;
      }

      // Brand match
      if (myItem.brand && theirBrand && myItem.brand.toLowerCase() === theirBrand) {
        score += 2;
      }

      // Their looking_for matches my item
      if (theirLookingFor) {
        const lfWords = theirLookingFor.split(/\s+/).filter((w) => w.length > 2);
        const hasMatch = lfWords.some(
          (w) => myCategory.includes(w) || (myItem.title || '').toLowerCase().includes(w)
        );
        if (hasMatch) score += 2;
      }

      return { ...myItem, _tradeScore: score };
    });

    scored.sort((a, b) => b._tradeScore - a._tradeScore);
    return scored.filter((item) => item._tradeScore >= 3).slice(0, 3);
  }, [listing, currentUserId, isOwnListing, myClosetItems]);

  const formatCondition = (val) => CONDITION_LABELS[val] || val;
  const formatTag = (val) => TAG_LABELS[val] || val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const formatCategory = (val) => val ? val.charAt(0).toUpperCase() + val.slice(1) : '';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={t.background} />
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  if (!listing) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Image Carousel */}
        <View style={styles.imageCarouselContainer}>
          {images.length > 0 ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleImageScroll}
              scrollEventThrottle={16}
            >
              {images.map((img, index) => (
                <Image
                  key={img.id || index}
                  source={{ uri: img.image_url }}
                  style={styles.carouselImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={64} color={t.textTertiary} />
              <Text style={styles.placeholderText}>No photos</Text>
            </View>
          )}

          {/* Pagination Dots */}
          {images.length > 1 && (
            <View style={styles.paginationContainer}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.paginationDot,
                    index === currentImageIndex && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={26} color={t.textWhite} />
          </TouchableOpacity>
        </View>

        {/* Title and Brand */}
        <View style={styles.contentPadding}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{listing.title}</Text>
            {listing.brand ? (
              <View style={styles.brandBadge}>
                <Text style={styles.brandBadgeText}>{listing.brand}</Text>
              </View>
            ) : null}
          </View>

          {/* Detail Chips */}
          <View style={styles.chipsRow}>
            {listing.size ? (
              <View style={styles.detailChip}>
                <Text style={styles.detailChipText}>{listing.size}</Text>
              </View>
            ) : null}
            {listing.condition ? (
              <View style={styles.detailChip}>
                <Text style={styles.detailChipText}>{formatCondition(listing.condition)}</Text>
              </View>
            ) : null}
            {listing.category ? (
              <View style={styles.detailChip}>
                <Text style={styles.detailChipText}>{formatCategory(listing.category)}</Text>
              </View>
            ) : null}
            {(listing.tags || []).map((tag, i) => (
              <View key={i} style={styles.vibeChip}>
                <Text style={styles.vibeChipText}>{formatTag(tag)}</Text>
              </View>
            ))}
          </View>

          {/* Estimated Trade Value */}
          {listing.estimated_value ? (
            <View style={styles.tradeValueRow}>
              <Ionicons name="pricetag" size={16} color={t.coral} />
              <Text style={styles.tradeValueText}>
                ${Number(listing.estimated_value).toFixed(0)} trade value
              </Text>
              {listing.open_to_swap_plus_cash && (
                <View style={styles.cashBadge}>
                  <Text style={styles.cashBadgeText}>+ cash ok</Text>
                </View>
              )}
            </View>
          ) : null}

          {/* What They're Looking For */}
          {(listing.looking_for || listing.open_to_brands || listing.not_interested_in) ? (
            <View style={styles.lookingForCard}>
              <View style={styles.lookingForHeader}>
                <Ionicons name="swap-horizontal" size={20} color={t.coral} />
                <Text style={styles.lookingForTitle}>What They're Looking For</Text>
              </View>

              {listing.looking_for ? (
                <View style={styles.lookingForField}>
                  <Text style={styles.lookingForLabel}>Looking for</Text>
                  <Text style={styles.lookingForValue}>{listing.looking_for}</Text>
                </View>
              ) : null}

              {listing.open_to_brands ? (
                <View style={styles.lookingForField}>
                  <Text style={styles.lookingForLabel}>Open to brands</Text>
                  <Text style={styles.lookingForValue}>{listing.open_to_brands}</Text>
                </View>
              ) : null}

              {listing.not_interested_in ? (
                <View style={styles.lookingForField}>
                  <Text style={styles.lookingForLabel}>Not interested in</Text>
                  <Text style={styles.lookingForNotValue}>{listing.not_interested_in}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Seller Info */}
          <TouchableOpacity
            style={styles.sellerRow}
            activeOpacity={0.7}
            onPress={() => {
              if (!isOwnListing && listing?.user_id) {
                navigation.navigate('UserCloset', { userId: listing.user_id });
              }
            }}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.sellerAvatar} />
            ) : (
              <View style={styles.sellerAvatarPlaceholder}>
                <Ionicons name="person" size={20} color={t.textTertiary} />
              </View>
            )}
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerUsername}>@{profile?.username || 'unknown'}</Text>
              {(profile?.location || listing.shipping_from) ? (
                <View style={styles.sellerLocationRow}>
                  <Ionicons name="location-outline" size={13} color={t.textTertiary} />
                  <Text style={styles.sellerLocation}>{profile?.location || listing.shipping_from}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textTertiary} />
          </TouchableOpacity>

          {/* Description */}
          {listing.description ? (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.descriptionText}>{listing.description}</Text>
            </View>
          ) : null}

          {/* Shipping From */}
          {listing.shipping_from ? (
            <View style={styles.shippingRow}>
              <Ionicons name="airplane-outline" size={16} color={t.textTertiary} />
              <Text style={styles.shippingText}>Ships from {listing.shipping_from}</Text>
            </View>
          ) : null}

          {/* Suggested Trades Section */}
          {!isOwnListing && suggestedTrades.length > 0 && (
            <View style={styles.suggestedTradesSection}>
              <View style={styles.suggestedTradesHeader}>
                <Ionicons name="swap-horizontal" size={20} color={t.coral} />
                <Text style={styles.suggestedTradesTitle}>Trade ideas for this item</Text>
              </View>
              <Text style={styles.suggestedTradesSubtitle}>
                Items from your closet that could be a good match
              </Text>

              {suggestedTrades.map((item) => {
                const myValue = Number(item.estimated_value) || 0;
                const theirValue = Number(listing.estimated_value) || 0;

                return (
                  <View key={item.id} style={styles.suggestedTradeCard}>
                    <TouchableOpacity
                      style={styles.suggestedTradeInfo}
                      activeOpacity={0.8}
                      onPress={() => navigation.push('ListingDetail', { listingId: item.id })}
                    >
                      {item.coverImage ? (
                        <Image source={{ uri: item.coverImage }} style={styles.suggestedTradeImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.suggestedTradeImagePlaceholder}>
                          <Ionicons name="image-outline" size={20} color={t.textTertiary} />
                        </View>
                      )}
                      <View style={styles.suggestedTradeDetails}>
                        <Text style={styles.suggestedTradeItemTitle} numberOfLines={1}>{item.title}</Text>
                        <View style={styles.suggestedTradeMeta}>
                          {item.size ? <Text style={styles.suggestedTradeChip}>{item.size}</Text> : null}
                          {item.brand ? <Text style={styles.suggestedTradeBrand} numberOfLines={1}>{item.brand}</Text> : null}
                        </View>
                        {myValue > 0 && theirValue > 0 && (
                          <Text style={styles.suggestedTradeValueText}>
                            ${myValue} {'\u2194'} ${theirValue}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.offerThisButton}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('SwapOffer', { listing, preSelectedItemId: item.id })}
                    >
                      <Text style={styles.offerThisButtonText}>Offer This</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Bottom spacer for the fixed button */}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={styles.bottomBar}>
        {isOwnListing ? (
          <TouchableOpacity
            style={styles.editButton}
            activeOpacity={0.8}
            onPress={() => {
              Alert.alert('Manage Listing', '', [
                {
                  text: 'Edit',
                  onPress: () => navigation.navigate('EditListing', { listing: { ...listing, listing_images: images } }),
                },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    Alert.alert(
                      'Delete Listing',
                      'Are you sure you want to delete this listing? This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            const { error } = await supabase
                              .from('listings')
                              .update({ status: 'removed' })
                              .eq('id', listing.id);
                            if (error) {
                              Alert.alert('Error', error.message);
                            } else {
                              navigation.goBack();
                            }
                          },
                        },
                      ]
                    );
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <Ionicons name="create-outline" size={20} color={t.textWhite} style={{ marginRight: 8 }} />
            <Text style={styles.bottomButtonText}>Edit Listing</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.bottomButtons}>
            <TouchableOpacity
              style={styles.askButton}
              activeOpacity={0.8}
              onPress={() => {
                Alert.alert(
                  'Ask a Question',
                  'What would you like to ask?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Open Chat',
                      onPress: async () => {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) return;
                        const { data: existing } = await supabase
                          .from('swap_interests')
                          .select('id')
                          .eq('interested_user_id', session.user.id)
                          .eq('listing_id', listing.id)
                          .limit(1);
                        let interestId;
                        if (existing && existing.length > 0) {
                          interestId = existing[0].id;
                        } else {
                          const { data: newInterest, error } = await supabase
                            .from('swap_interests')
                            .insert({
                              interested_user_id: session.user.id,
                              listing_id: listing.id,
                              status: 'pending',
                            })
                            .select()
                            .single();
                          if (error) {
                            Alert.alert('Error', error.message);
                            return;
                          }
                          interestId = newInterest.id;
                        }
                        navigation.navigate('SwapChat', {
                          interestId,
                          otherUser: listing.profiles,
                        });
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="chatbubble-outline" size={18} color="#ccc" style={{ marginRight: 6 }} />
              <Text style={styles.askButtonText}>Ask Question</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.swapButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('SwapOffer', { listing })}
            >
              <Ionicons name="swap-horizontal" size={20} color={t.textWhite} style={{ marginRight: 8 }} />
              <Text style={styles.bottomButtonText}>Make Offer</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: t.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  /* Image Carousel */
  imageCarouselContainer: {
    position: 'relative',
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: t.placeholder,
  },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
  },
  imagePlaceholder: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.placeholder,
  },
  placeholderText: {
    color: t.textTertiary,
    fontSize: 14,
    marginTop: 8,
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  paginationDotActive: {
    backgroundColor: '#fff',
    width: 20,
    borderRadius: 4,
  },
  backButton: {
    position: 'absolute',
    top: 52,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  contentPadding: {
    paddingHorizontal: 20,
  },

  /* Title Row */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: t.text,
    flex: 1,
    lineHeight: 30,
  },
  brandBadge: {
    backgroundColor: t.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: t.separator,
    marginTop: 2,
  },
  brandBadgeText: {
    color: t.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Detail Chips */
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  detailChip: {
    backgroundColor: '#FF6B6B18',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#FF6B6B40',
  },
  detailChipText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
  },
  vibeChip: {
    backgroundColor: '#FF6B6B10',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#FF6B6B30',
  },
  vibeChipText: {
    color: '#FF8A8A',
    fontSize: 13,
    fontWeight: '500',
  },

  /* Trade Value */
  tradeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  tradeValueText: {
    color: '#FF6B6B',
    fontSize: 18,
    fontWeight: '700',
  },
  cashBadge: {
    backgroundColor: '#FF6B6B20',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cashBadgeText: {
    color: '#FF8A8A',
    fontSize: 11,
    fontWeight: '600',
  },

  /* Looking For Card */
  lookingForCard: {
    backgroundColor: t.cardAlt,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#FF6B6B40',
    marginBottom: 20,
  },
  lookingForHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  lookingForTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: t.text,
  },
  lookingForField: {
    marginBottom: 12,
  },
  lookingForLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: t.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  lookingForValue: {
    fontSize: 15,
    color: t.textSecondary,
    lineHeight: 22,
  },
  lookingForNotValue: {
    fontSize: 15,
    color: t.textTertiary,
    lineHeight: 22,
    fontStyle: 'italic',
  },

  /* Seller Row */
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.card,
  },
  sellerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerUsername: {
    color: t.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sellerLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  sellerLocation: {
    color: t.textTertiary,
    fontSize: 13,
  },

  /* Description */
  descriptionSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: t.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descriptionText: {
    color: t.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },

  /* Shipping */
  shippingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: t.separator,
  },
  shippingText: {
    color: t.textTertiary,
    fontSize: 14,
  },

  /* Suggested Trades */
  suggestedTradesSection: {
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: t.cardAlt,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FF6B6B30',
  },
  suggestedTradesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  suggestedTradesTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: t.text,
  },
  suggestedTradesSubtitle: {
    fontSize: 13,
    color: t.textTertiary,
    marginBottom: 14,
  },
  suggestedTradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  suggestedTradeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestedTradeImage: {
    width: 56,
    height: 70,
    borderRadius: 8,
    backgroundColor: t.placeholder,
  },
  suggestedTradeImagePlaceholder: {
    width: 56,
    height: 70,
    borderRadius: 8,
    backgroundColor: t.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedTradeDetails: {
    flex: 1,
    marginLeft: 12,
  },
  suggestedTradeItemTitle: {
    color: t.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  suggestedTradeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  suggestedTradeChip: {
    color: t.textTertiary,
    fontSize: 11,
    fontWeight: '500',
    backgroundColor: t.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  suggestedTradeBrand: {
    color: t.textTertiary,
    fontSize: 11,
    flexShrink: 1,
  },
  suggestedTradeValueText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  offerThisButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: 10,
  },
  offerThisButtonText: {
    color: t.text,
    fontSize: 13,
    fontWeight: '700',
  },

  /* Bottom Bar */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    backgroundColor: t.background,
    borderTopWidth: 1,
    borderTopColor: t.separator,
  },
  bottomButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  askButton: {
    backgroundColor: t.card,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.separator,
  },
  askButtonText: {
    color: t.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  swapButton: {
    flex: 1,
    backgroundColor: '#FF6B6B',
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  bottomButtonText: {
    color: t.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
