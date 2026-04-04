import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { t } from '../app/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_GAP * 3) / 2;
const CARD_IMAGE_HEIGHT = CARD_WIDTH * 1.25;
const SWAP_CARD_WIDTH = SCREEN_WIDTH - CARD_GAP * 4;

const CATEGORIES = ['All', 'Tops', 'Bottoms', 'Dresses', 'Shoes', 'Outerwear', 'Accessories'];

const TABS = ['Discover', 'For You'];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState([]);
  const [filteredListings, setFilteredListings] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Discover');

  // Search state
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef(null);

  // For You state
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [myListings, setMyListings] = useState([]);
  const [myListingsFull, setMyListingsFull] = useState([]);
  const [forYouListings, setForYouListings] = useState([]);
  const [swapMatches, setSwapMatches] = useState([]);
  const [similarUsers, setSimilarUsers] = useState([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [featuredMatches, setFeaturedMatches] = useState([]);

  // Derived: does the user have listings?
  const hasCloset = myListings.length > 0;

  // Debounced search: update debouncedSearch 300ms after user stops typing
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchText.trim().toLowerCase());
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchText]);

  // Helper: check if a listing matches the search query
  const matchesSearch = useCallback((listing, query) => {
    if (!query) return true;
    const fields = [listing.title, listing.brand, listing.description, listing.color];
    return fields.some((f) => f && f.toLowerCase().includes(query));
  }, []);

  // Build the user's style profile from their listings
  const styleProfile = useMemo(() => {
    if (myListings.length === 0) return null;

    const sizes = new Set();
    const categories = new Set();
    const tags = new Set();
    const brands = new Set();
    const titleWords = new Set();

    myListings.forEach((l) => {
      if (l.size) sizes.add(l.size.toLowerCase());
      if (l.category) categories.add(l.category.toLowerCase());
      if (l.brand) brands.add(l.brand.toLowerCase());
      (l.tags || []).forEach((t) => tags.add(t.toLowerCase()));
      if (l.title) {
        l.title.toLowerCase().split(/\s+/).forEach((w) => {
          if (w.length > 2) titleWords.add(w);
        });
      }
    });

    return { sizes, categories, tags, brands, titleWords };
  }, [myListings]);

  const fetchCurrentUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      setCurrentUserId(data.session.user.id);
      // Fetch profile for looking_for
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, looking_for, open_to_brands, not_interested_in')
        .eq('id', data.session.user.id)
        .single();
      if (profileData) {
        setCurrentUserProfile(profileData);
      }
      return data.session.user.id;
    }
    return null;
  }, []);

  const fetchListings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*, profiles(id, username, avatar_url, display_name, location, looking_for, open_to_brands), listing_images(image_url, display_order)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching listings:', error);
        return;
      }

      const processed = (data || []).map((listing) => {
        const images = listing.listing_images || [];
        const sorted = images.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
        const coverImage = sorted.length > 0 ? sorted[0].image_url : null;
        const username = listing.profiles?.username || 'unknown';
        const avatarUrl = listing.profiles?.avatar_url || null;

        return {
          ...listing,
          coverImage,
          username,
          avatarUrl,
        };
      });

      setListings(processed);
    } catch (err) {
      console.error('Unexpected error fetching listings:', err);
    }
  }, []);

  const fetchMyListings = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, category, size, brand, tags, estimated_value')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching user listings:', error);
        return;
      }
      setMyListings(data || []);
    } catch (err) {
      console.error('Unexpected error fetching my listings:', err);
    }
  }, []);

  // Fetch full versions of my listings (with images) for swap match display
  const fetchMyListingsFull = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(image_url, display_order)')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching full user listings:', error);
        return;
      }

      const processed = (data || []).map((listing) => {
        const images = listing.listing_images || [];
        const sorted = images.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
        const coverImage = sorted.length > 0 ? sorted[0].image_url : null;
        return { ...listing, coverImage };
      });

      setMyListingsFull(processed);
    } catch (err) {
      console.error('Unexpected error fetching full my listings:', err);
    }
  }, []);

  // Fetch featured matches from admin-curated table
  const fetchFeaturedMatches = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('featured_matches')
        .select(`
          id, admin_note, status, created_at,
          listing_a:listings!listing_a_id(id, title, brand, size, category, estimated_value, user_id, profiles(username, avatar_url), listing_images(image_url, display_order)),
          listing_b:listings!listing_b_id(id, title, brand, size, category, estimated_value, user_id, profiles(username, avatar_url), listing_images(image_url, display_order))
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching featured matches:', error);
        return;
      }

      const processed = (data || []).filter((fm) => {
        // Show featured matches relevant to the current user
        // (where one of the listings belongs to them)
        if (!fm.listing_a || !fm.listing_b) return false;
        return fm.listing_a.user_id === userId || fm.listing_b.user_id === userId;
      }).map((fm) => {
        const processListing = (l) => {
          const images = l.listing_images || [];
          const sorted = images.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
          return {
            ...l,
            coverImage: sorted.length > 0 ? sorted[0].image_url : null,
            username: l.profiles?.username || 'unknown',
            avatarUrl: l.profiles?.avatar_url || null,
          };
        };
        return {
          ...fm,
          listing_a: processListing(fm.listing_a),
          listing_b: processListing(fm.listing_b),
        };
      });

      setFeaturedMatches(processed);
    } catch (err) {
      console.error('Error fetching featured matches:', err);
    }
  }, []);

  // Compute two-sided swap matches
  const computeSwapMatches = useCallback(() => {
    if (!styleProfile || !currentUserId || myListingsFull.length === 0) {
      setSwapMatches([]);
      return;
    }

    const otherListings = listings.filter((l) => l.user_id !== currentUserId);
    const matches = [];

    myListingsFull.forEach((myItem) => {
      const myValue = Number(myItem.estimated_value) || 0;
      const myCategory = (myItem.category || '').toLowerCase();
      const mySize = (myItem.size || '').toLowerCase();
      const myBrand = (myItem.brand || '').toLowerCase();
      const myTags = (myItem.tags || []).map((t) => t.toLowerCase());
      const myTitleWords = (myItem.title || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);

      otherListings.forEach((theirItem) => {
        const theirValue = Number(theirItem.estimated_value) || 0;

        // No hard value filter — we'll suggest cash/bundle for mismatches

        // Pre-filter: some size or category overlap
        const theirSize = (theirItem.size || '').toLowerCase();
        const theirCategory = (theirItem.category || '').toLowerCase();
        const sizeMatch = theirSize && styleProfile.sizes.has(theirSize);
        const categoryMatch = theirCategory && styleProfile.categories.has(theirCategory);
        if (!sizeMatch && !categoryMatch) return;

        // Compute two-sided score
        let score = 0;

        // +3 if their item's size matches any size in user's closet
        if (sizeMatch) score += 3;

        // +3 if their item's category matches any category user owns
        if (categoryMatch) score += 3;

        // +2 for each overlapping vibe tag
        const theirTags = (theirItem.tags || []).map((t) => t.toLowerCase());
        theirTags.forEach((tag) => {
          if (styleProfile.tags.has(tag)) score += 2;
        });

        // +2 if their item's brand matches any brand user owns
        if (theirItem.brand && styleProfile.brands.has(theirItem.brand.toLowerCase())) {
          score += 2;
        }

        // Value scoring: closer values score higher, but mismatches still show
        if (myValue > 0 && theirValue > 0) {
          const ratio = myValue > theirValue ? theirValue / myValue : myValue / theirValue;
          if (ratio >= 0.75) score += 3;
          else if (ratio >= 0.5) score += 1;
          // No penalty for bigger gaps — we'll suggest cash/bundle
        }

        // +2 if their profile's "looking_for" text matches user's item
        const theirLookingFor = (theirItem.profiles?.looking_for || '').toLowerCase();
        if (theirLookingFor) {
          const lfWords = theirLookingFor.split(/\s+/).filter((w) => w.length > 2);
          const hasMatch = lfWords.some(
            (w) => myCategory.includes(w) || myTitleWords.includes(w) || myBrand.includes(w)
          );
          if (hasMatch) score += 2;
        }

        // +2 if user's profile's "looking_for" matches their item
        const myLookingFor = (currentUserProfile?.looking_for || '').toLowerCase();
        if (myLookingFor) {
          const lfWords = myLookingFor.split(/\s+/).filter((w) => w.length > 2);
          const hasMatch = lfWords.some(
            (w) => theirCategory.includes(w) || (theirItem.title || '').toLowerCase().includes(w) || (theirItem.brand || '').toLowerCase().includes(w)
          );
          if (hasMatch) score += 2;
        }

        if (score >= 4) {
          // Determine trade type suggestion
          let tradeType = 'swap';
          let valueDiff = 0;
          if (myValue > 0 && theirValue > 0) {
            valueDiff = theirValue - myValue;
            const ratio = myValue > theirValue ? theirValue / myValue : myValue / theirValue;
            if (ratio < 0.5) tradeType = 'bundle';
            else if (ratio < 0.75) tradeType = 'cash';
          }

          matches.push({
            myItem,
            theirItem,
            score,
            tradeType,
            valueDiff,
            valueMatch: myValue > 0 && theirValue > 0 ? getValueMatchLabel(myValue, theirValue, tradeType, valueDiff) : null,
          });
        }
      });
    });

    // Sort by score descending, take top 15
    matches.sort((a, b) => b.score - a.score);
    setSwapMatches(matches.slice(0, 15));
  }, [styleProfile, currentUserId, currentUserProfile, listings, myListingsFull]);

  // Score and sort For You listings (existing logic, kept as secondary section)
  const computeForYou = useCallback(() => {
    if (!styleProfile || !currentUserId) return;

    const otherListings = listings.filter((l) => l.user_id !== currentUserId);

    const scored = otherListings.map((listing) => {
      let score = 0;

      if (listing.size && styleProfile.sizes.has(listing.size.toLowerCase())) {
        score += 3;
      }
      if (listing.category && styleProfile.categories.has(listing.category.toLowerCase())) {
        score += 2;
      }
      (listing.tags || []).forEach((tag) => {
        if (styleProfile.tags.has(tag.toLowerCase())) {
          score += 2;
        }
      });
      if (listing.brand && styleProfile.brands.has(listing.brand.toLowerCase())) {
        score += 1;
      }
      const theirLookingFor = (listing.profiles?.looking_for || '').toLowerCase();
      if (theirLookingFor) {
        const lfWords = theirLookingFor.split(/\s+/);
        const hasMatch = lfWords.some(
          (w) => w.length > 2 && (styleProfile.titleWords.has(w) || styleProfile.categories.has(w))
        );
        if (hasMatch) score += 1;
      }

      return { ...listing, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);
    setForYouListings(scored);

    // Compute similar users
    computeSimilarUsers(otherListings);
  }, [styleProfile, currentUserId, listings]);

  const computeSimilarUsers = useCallback(
    (otherListings) => {
      if (!styleProfile) return;

      const userMap = {};
      otherListings.forEach((l) => {
        const uid = l.user_id;
        if (!userMap[uid]) {
          userMap[uid] = {
            userId: uid,
            username: l.username,
            avatarUrl: l.avatarUrl,
            displayName: l.profiles?.display_name || null,
            tags: new Set(),
            categories: new Set(),
            sizes: new Set(),
          };
        }
        (l.tags || []).forEach((t) => userMap[uid].tags.add(t.toLowerCase()));
        if (l.category) userMap[uid].categories.add(l.category.toLowerCase());
        if (l.size) userMap[uid].sizes.add(l.size.toLowerCase());
      });

      const userScores = Object.values(userMap).map((u) => {
        let score = 0;
        u.tags.forEach((t) => { if (styleProfile.tags.has(t)) score += 2; });
        u.categories.forEach((c) => { if (styleProfile.categories.has(c)) score += 1; });
        u.sizes.forEach((s) => { if (styleProfile.sizes.has(s)) score += 1; });
        return { ...u, score };
      });

      userScores.sort((a, b) => b.score - a.score);
      setSimilarUsers(userScores.filter((u) => u.score > 0).slice(0, 10));
    },
    [styleProfile]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const userId = await fetchCurrentUser();
      await Promise.all([fetchListings(), fetchMyListings(userId), fetchMyListingsFull(userId), fetchFeaturedMatches(userId)]);
      setLoading(false);
    })();
  }, [fetchCurrentUser, fetchListings, fetchMyListings, fetchMyListingsFull, fetchFeaturedMatches]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        fetchListings();
        if (currentUserId) {
          fetchMyListings(currentUserId);
          fetchMyListingsFull(currentUserId);
          fetchFeaturedMatches(currentUserId);
        }
      }
    }, [loading, currentUserId, fetchListings, fetchMyListings, fetchMyListingsFull, fetchFeaturedMatches])
  );

  // Recompute For You and swap matches whenever dependencies change
  useEffect(() => {
    if (activeTab === 'For You' && styleProfile) {
      setForYouLoading(true);
      computeForYou();
      computeSwapMatches();
      setForYouLoading(false);
    }
  }, [activeTab, computeForYou, computeSwapMatches, styleProfile]);

  useEffect(() => {
    let result = listings;
    if (selectedCategory !== 'All') {
      result = result.filter(
        (l) => l.category && l.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }
    if (debouncedSearch) {
      result = result.filter((l) => matchesSearch(l, debouncedSearch));
    }
    setFilteredListings(result);
  }, [selectedCategory, listings, debouncedSearch, matchesSearch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const userId = currentUserId || (await fetchCurrentUser());
    await Promise.all([fetchListings(), fetchMyListings(userId), fetchMyListingsFull(userId), fetchFeaturedMatches(userId)]);
    setRefreshing(false);
  }, [currentUserId, fetchCurrentUser, fetchListings, fetchMyListings, fetchMyListingsFull, fetchFeaturedMatches]);

  const handleCardPress = (listing) => {
    navigation.navigate('ListingDetail', { listingId: listing.id });
  };

  // ── Swap Match Card ──
  const renderSwapMatchCard = (match, index) => {
    const { myItem, theirItem, valueMatch } = match;
    const myValue = Number(myItem.estimated_value) || 0;
    const theirValue = Number(theirItem.estimated_value) || 0;

    return (
      <View key={`swap-${myItem.id}-${theirItem.id}-${index}`} style={styles.swapCard}>
        <View style={styles.swapCardInner}>
          {/* My item (left) */}
          <TouchableOpacity
            style={styles.swapSide}
            activeOpacity={0.8}
            onPress={() => handleCardPress(myItem)}
          >
            {myItem.coverImage ? (
              <Image source={{ uri: myItem.coverImage }} style={styles.swapItemImage} resizeMode="cover" />
            ) : (
              <View style={styles.swapItemImagePlaceholder}>
                <Ionicons name="image-outline" size={24} color={t.textTertiary} />
              </View>
            )}
            <Text style={styles.swapItemTitle} numberOfLines={1}>{myItem.title}</Text>
            {myValue > 0 && <Text style={styles.swapItemValue}>${myValue}</Text>}
            <Text style={styles.swapYourLabel}>Your item</Text>
          </TouchableOpacity>

          {/* Swap icon (center) */}
          <View style={styles.swapIconContainer}>
            <View style={styles.swapIconCircle}>
              <Ionicons name="swap-horizontal" size={20} color={t.textWhite} />
            </View>
          </View>

          {/* Their item (right) */}
          <TouchableOpacity
            style={styles.swapSide}
            activeOpacity={0.8}
            onPress={() => handleCardPress(theirItem)}
          >
            {theirItem.coverImage ? (
              <Image source={{ uri: theirItem.coverImage }} style={styles.swapItemImage} resizeMode="cover" />
            ) : (
              <View style={styles.swapItemImagePlaceholder}>
                <Ionicons name="image-outline" size={24} color={t.textTertiary} />
              </View>
            )}
            <Text style={styles.swapItemTitle} numberOfLines={1}>{theirItem.title}</Text>
            {theirValue > 0 && <Text style={styles.swapItemValue}>${theirValue}</Text>}
            <Text style={styles.swapTheirLabel} numberOfLines={1}>@{theirItem.username}</Text>
          </TouchableOpacity>
        </View>

        {/* Value comparison */}
        {valueMatch && (
          <View style={styles.swapValueRow}>
            <Ionicons name="checkmark-circle" size={14} color={valueMatch.color || '#FF6B6B'} />
            <Text style={styles.swapValueText}>{valueMatch.text}</Text>
            {valueMatch.hint ? (
              <View style={[styles.swapHintBadge, { backgroundColor: (valueMatch.color || '#FF6B6B') + '20' }]}>
                <Text style={[styles.swapHintText, { color: valueMatch.color || '#FF6B6B' }]}>{valueMatch.hint}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Make Offer button */}
        <TouchableOpacity
          style={styles.swapOfferButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('SwapOffer', { listing: theirItem })}
        >
          <Ionicons name="swap-horizontal" size={16} color={t.textWhite} style={{ marginRight: 6 }} />
          <Text style={styles.swapOfferButtonText}>Make Offer</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Header for Discover tab ──
  const renderDiscoverHeader = () => (
    <View>
      {renderTopSection()}

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Engagement banner for users with no closet */}
      {!hasCloset && (
        <TouchableOpacity
          style={styles.engageBanner}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('CreateListing')}
        >
          <Ionicons name="sparkles" size={16} color={t.coral} />
          <Text style={styles.engageBannerText}>
            Get personalized picks — post items to your closet!
          </Text>
          <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Header for For You tab ──
  const renderForYouHeader = () => (
    <View>
      {renderTopSection()}

      {/* Empty closet message */}
      {!hasCloset && (
        <View style={styles.forYouEmptyContainer}>
          <View style={styles.forYouEmptyIconWrap}>
            <Ionicons name="sparkles" size={40} color={t.coral} />
          </View>
          <Text style={styles.forYouEmptyTitle}>Your personalized feed awaits</Text>
          <Text style={styles.forYouEmptySubtitle}>
            Post some items to get personalized recommendations!
          </Text>
          <TouchableOpacity
            style={styles.forYouEmptyButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CreateListing')}
          >
            <Ionicons name="add-circle-outline" size={18} color={t.textWhite} style={{ marginRight: 6 }} />
            <Text style={styles.forYouEmptyButtonText}>Add to Your Closet</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Suggested by swapd (featured matches) */}
      {featuredMatches.length > 0 && (
        <View style={styles.featuredSection}>
          <View style={styles.featuredHeaderRow}>
            <View style={styles.featuredBadge}>
              <Ionicons name="star" size={12} color={t.textWhite} />
            </View>
            <Text style={styles.featuredHeaderTitle}>Suggested by swapd</Text>
          </View>
          <Text style={styles.featuredHeaderSubtitle}>Picked for you by swapd</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.swapMatchesScroll}
            snapToInterval={SWAP_CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
          >
            {featuredMatches.map((fm) => {
              const isMyA = fm.listing_a.user_id === currentUserId;
              const myItem = isMyA ? fm.listing_a : fm.listing_b;
              const theirItem = isMyA ? fm.listing_b : fm.listing_a;
              const myValue = Number(myItem.estimated_value) || 0;
              const theirValue = Number(theirItem.estimated_value) || 0;

              return (
                <View key={fm.id} style={[styles.swapCard, styles.featuredCard]}>
                  <View style={styles.featuredLabel}>
                    <Ionicons name="star" size={10} color="#FFD700" />
                    <Text style={styles.featuredLabelText}>Picked for you by swapd</Text>
                  </View>
                  <View style={styles.swapCardInner}>
                    <TouchableOpacity
                      style={styles.swapSide}
                      activeOpacity={0.8}
                      onPress={() => handleCardPress(myItem)}
                    >
                      {myItem.coverImage ? (
                        <Image source={{ uri: myItem.coverImage }} style={styles.swapItemImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.swapItemImagePlaceholder}>
                          <Ionicons name="image-outline" size={24} color={t.textTertiary} />
                        </View>
                      )}
                      <Text style={styles.swapItemTitle} numberOfLines={1}>{myItem.title}</Text>
                      {myValue > 0 && <Text style={styles.swapItemValue}>${myValue}</Text>}
                      <Text style={styles.swapYourLabel}>Your item</Text>
                    </TouchableOpacity>

                    <View style={styles.swapIconContainer}>
                      <View style={[styles.swapIconCircle, { backgroundColor: '#FFD700' }]}>
                        <Ionicons name="swap-horizontal" size={20} color="#000" />
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.swapSide}
                      activeOpacity={0.8}
                      onPress={() => handleCardPress(theirItem)}
                    >
                      {theirItem.coverImage ? (
                        <Image source={{ uri: theirItem.coverImage }} style={styles.swapItemImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.swapItemImagePlaceholder}>
                          <Ionicons name="image-outline" size={24} color={t.textTertiary} />
                        </View>
                      )}
                      <Text style={styles.swapItemTitle} numberOfLines={1}>{theirItem.title}</Text>
                      {theirValue > 0 && <Text style={styles.swapItemValue}>${theirValue}</Text>}
                      <Text style={styles.swapTheirLabel} numberOfLines={1}>@{theirItem.username}</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.swapOfferButton, styles.featuredOfferButton]}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('SwapOffer', { listing: theirItem })}
                  >
                    <Ionicons name="swap-horizontal" size={16} color="#000" style={{ marginRight: 6 }} />
                    <Text style={[styles.swapOfferButtonText, { color: '#000' }]}>Make Offer</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Section 1: Swap Matches */}
      {hasCloset && swapMatches.length > 0 && (
        <View style={styles.swapMatchesSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="swap-horizontal" size={18} color={t.coral} />
            <Text style={styles.sectionHeaderTitle}>Swap Matches</Text>
          </View>
          <Text style={styles.sectionHeaderSubtitle}>Trades that could work for both sides</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.swapMatchesScroll}
            snapToInterval={SWAP_CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
          >
            {swapMatches.map((match, index) => renderSwapMatchCard(match, index))}
          </ScrollView>
        </View>
      )}

      {/* Closets Like Yours */}
      {hasCloset && similarUsers.length > 0 && (
        <View style={styles.similarSection}>
          <Text style={styles.similarSectionTitle}>Closets Like Yours</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.similarScroll}
          >
            {similarUsers.map((user) => (
              <TouchableOpacity
                key={user.userId}
                style={styles.similarUserItem}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('UserCloset', { userId: user.userId })
                }
              >
                {user.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.similarAvatar} />
                ) : (
                  <View style={styles.similarAvatarPlaceholder}>
                    <Ionicons name="person" size={20} color={t.textTertiary} />
                  </View>
                )}
                <Text style={styles.similarUsername} numberOfLines={1}>
                  @{user.username}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Section 2 header: Items You'd Love */}
      {hasCloset && forYouListings.length > 0 && (
        <View style={styles.forYouSubheader}>
          <Ionicons name="sparkles" size={14} color={t.coral} />
          <Text style={styles.forYouSubheaderText}>Items You'd Love</Text>
        </View>
      )}
    </View>
  );

  // ── Shared top section (branding, search, tab toggle) ──
  const renderTopSection = () => (
    <View>
      {/* Branding + Search */}
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.brandText}>swapd</Text>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={t.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search listings..."
          placeholderTextColor={t.textTertiary}
          editable={true}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchText('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color={t.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabToggleContainer}>
        <View style={styles.tabToggleTrack}>
          {TABS.map((tab) => {
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabTogglePill, active && styles.tabTogglePillActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                {tab === 'For You' && (
                  <Ionicons
                    name="sparkles"
                    size={13}
                    color={active ? '#fff' : '#777'}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text style={[styles.tabToggleText, active && styles.tabToggleTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  const renderEmptyState = () => {
    if (debouncedSearch) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color={t.textTertiary} />
          <Text style={styles.emptyTitle}>No results for '{debouncedSearch}'</Text>
          <Text style={styles.emptySubtitle}>Try a different search term</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="shirt-outline" size={64} color={t.textTertiary} />
        <Text style={styles.emptyTitle}>No listings yet</Text>
        <Text style={styles.emptySubtitle}>Be the first to post!</Text>
      </View>
    );
  };

  const renderForYouEmpty = () => {
    if (!hasCloset) return null; // Already handled in header
    if (debouncedSearch) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color={t.textTertiary} />
          <Text style={styles.emptyTitle}>No results for '{debouncedSearch}'</Text>
          <Text style={styles.emptySubtitle}>Try a different search term</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={64} color={t.textTertiary} />
        <Text style={styles.emptyTitle}>No matches yet</Text>
        <Text style={styles.emptySubtitle}>Check back as more people post!</Text>
      </View>
    );
  };

  const renderListingCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleCardPress(item)}
      activeOpacity={0.85}
    >
      {item.coverImage ? (
        <Image source={{ uri: item.coverImage }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Ionicons name="image-outline" size={36} color={t.textTertiary} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.cardMeta}>
          {item.size ? <Text style={styles.cardSize}>{item.size}</Text> : null}
          {item.brand ? (
            <Text style={styles.cardBrand} numberOfLines={1}>
              {item.brand}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.cardUserRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('UserCloset', { userId: item.user_id })}
        >
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarMini} />
          ) : (
            <View style={styles.avatarMiniPlaceholder}>
              <Ionicons name="person" size={10} color={t.textTertiary} />
            </View>
          )}
          <Text style={styles.cardUsername} numberOfLines={1}>
            @{item.username}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Score badge for For You tab */}
      {activeTab === 'For You' && item._score > 0 && (
        <View style={styles.matchBadge}>
          <Ionicons name="sparkles" size={10} color={t.textWhite} />
        </View>
      )}
    </TouchableOpacity>
  );

  const isForYou = activeTab === 'For You';
  const forYouFiltered = useMemo(() => {
    if (!hasCloset) return [];
    let result = forYouListings;
    if (debouncedSearch) {
      result = result.filter((l) => matchesSearch(l, debouncedSearch));
    }
    return result;
  }, [forYouListings, hasCloset, debouncedSearch, matchesSearch]);
  const displayData = isForYou ? forYouFiltered : filteredListings;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />
      <FlatList
        data={displayData}
        renderItem={renderListingCard}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        columnWrapperStyle={displayData.length > 0 ? styles.row : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={isForYou ? renderForYouHeader : renderDiscoverHeader}
        ListEmptyComponent={isForYou ? renderForYouEmpty : renderEmptyState}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF6B6B"
            colors={['#FF6B6B']}
          />
        }
      />
    </View>
  );
}

function getValueMatchLabel(myValue, theirValue, tradeType, valueDiff) {
  const diff = Math.abs(myValue - theirValue);
  const avg = (myValue + theirValue) / 2;
  const pct = avg > 0 ? diff / avg : 0;

  if (pct <= 0.1) {
    return { text: `$${myValue} \u2194 $${theirValue}`, hint: 'Even swap!', color: '#4CAF50' };
  } else if (pct <= 0.25) {
    return { text: `$${myValue} \u2194 $${theirValue}`, hint: 'Close match', color: '#4CAF50' };
  } else if (tradeType === 'cash') {
    const cashNeeded = Math.abs(Math.round(valueDiff));
    if (valueDiff > 0) {
      return { text: `$${myValue} \u2194 $${theirValue}`, hint: `Swap + $${cashNeeded} cash`, color: '#FFA726' };
    } else {
      return { text: `$${myValue} \u2194 $${theirValue}`, hint: `Swap + $${cashNeeded} cash`, color: '#FFA726' };
    }
  } else if (tradeType === 'bundle') {
    return { text: `$${myValue} \u2194 $${theirValue}`, hint: 'Try a bundle offer', color: '#FFA726' };
  } else {
    return { text: `$${myValue} \u2194 $${theirValue}`, hint: '', color: t.textTertiary };
  }
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

  /* Header */
  headerRow: {
    paddingHorizontal: CARD_GAP,
    paddingTop: 12,
    paddingBottom: 4,
  },
  brandText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF6B6B',
    letterSpacing: -0.5,
  },

  /* Search */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 10,
    marginHorizontal: CARD_GAP,
    marginTop: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: t.text,
    fontSize: 15,
  },

  /* Tab Toggle */
  tabToggleContainer: {
    paddingHorizontal: CARD_GAP,
    paddingTop: 14,
    paddingBottom: 4,
  },
  tabToggleTrack: {
    flexDirection: 'row',
    backgroundColor: t.card,
    borderRadius: 24,
    padding: 3,
  },
  tabTogglePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 21,
  },
  tabTogglePillActive: {
    backgroundColor: '#FF6B6B',
  },
  tabToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: t.textTertiary,
  },
  tabToggleTextActive: {
    color: t.text,
  },

  /* Category chips */
  chipsContainer: {
    paddingHorizontal: CARD_GAP,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: t.card,
    marginRight: 0,
  },
  chipActive: {
    backgroundColor: '#FF6B6B',
  },
  chipText: {
    color: t.textTertiary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: t.text,
  },

  /* Engagement banner (Discover tab, no closet) */
  engageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    marginHorizontal: CARD_GAP,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B6B25',
    gap: 8,
  },
  engageBannerText: {
    flex: 1,
    color: t.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },

  /* For You - empty closet state */
  forYouEmptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 50,
    paddingBottom: 30,
  },
  forYouEmptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B6B15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  forYouEmptyTitle: {
    color: t.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  forYouEmptySubtitle: {
    color: t.textTertiary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  forYouEmptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
  },
  forYouEmptyButtonText: {
    color: t.text,
    fontSize: 16,
    fontWeight: '700',
  },

  /* Swap Matches Section */
  /* Featured / Suggested by swapd */
  featuredSection: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  featuredHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CARD_GAP,
    gap: 8,
  },
  featuredBadge: {
    backgroundColor: '#FFD700',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredHeaderTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '700',
  },
  featuredHeaderSubtitle: {
    color: t.textTertiary,
    fontSize: 13,
    paddingHorizontal: CARD_GAP,
    marginTop: 2,
    marginBottom: 8,
  },
  featuredCard: {
    borderColor: '#FFD70040',
    borderWidth: 1,
  },
  featuredLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  featuredLabelText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  featuredOfferButton: {
    backgroundColor: '#FFD700',
  },

  swapMatchesSection: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: CARD_GAP,
    marginBottom: 4,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: t.text,
  },
  sectionHeaderSubtitle: {
    fontSize: 13,
    color: t.textTertiary,
    paddingHorizontal: CARD_GAP,
    marginBottom: 14,
  },
  swapMatchesScroll: {
    paddingHorizontal: CARD_GAP,
    gap: CARD_GAP,
  },
  swapCard: {
    width: SWAP_CARD_WIDTH,
    backgroundColor: t.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FF6B6B30',
  },
  swapCardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  swapSide: {
    flex: 1,
    alignItems: 'center',
  },
  swapItemImage: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: 10,
    backgroundColor: t.placeholder,
  },
  swapItemImagePlaceholder: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: 10,
    backgroundColor: t.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapItemTitle: {
    color: t.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  swapItemValue: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  swapYourLabel: {
    color: t.textTertiary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  swapTheirLabel: {
    color: t.textTertiary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  swapIconContainer: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  swapIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#252525',
  },
  swapValueText: {
    color: t.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  swapHintBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 6,
  },
  swapHintText: {
    fontSize: 11,
    fontWeight: '700',
  },
  swapOfferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  swapOfferButtonText: {
    color: t.text,
    fontSize: 15,
    fontWeight: '700',
  },

  /* Closets Like Yours */
  similarSection: {
    paddingTop: 14,
    paddingBottom: 6,
  },
  similarSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B6B',
    paddingHorizontal: CARD_GAP,
    marginBottom: 12,
  },
  similarScroll: {
    paddingHorizontal: CARD_GAP,
    gap: 14,
    paddingBottom: 4,
  },
  similarUserItem: {
    alignItems: 'center',
    width: 68,
  },
  similarAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.card,
    borderWidth: 2,
    borderColor: '#FF6B6B50',
  },
  similarAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF6B6B50',
  },
  similarUsername: {
    color: t.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },

  /* For You subheader */
  forYouSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: CARD_GAP,
    paddingTop: 16,
    paddingBottom: 10,
  },
  forYouSubheaderText: {
    color: t.textTertiary,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Match badge on cards */
  matchBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Grid */
  listContent: {
    paddingBottom: 100,
  },
  row: {
    paddingHorizontal: CARD_GAP,
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },

  /* Card */
  card: {
    width: CARD_WIDTH,
    backgroundColor: t.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: CARD_IMAGE_HEIGHT,
    backgroundColor: t.placeholder,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: CARD_IMAGE_HEIGHT,
    backgroundColor: t.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 10,
  },
  cardTitle: {
    color: t.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cardSize: {
    color: t.textTertiary,
    fontSize: 12,
    fontWeight: '500',
    backgroundColor: t.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardBrand: {
    color: t.textTertiary,
    fontSize: 12,
    flexShrink: 1,
  },
  cardUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  avatarMini: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: t.card,
  },
  avatarMiniPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardUsername: {
    color: t.textTertiary,
    fontSize: 12,
    flexShrink: 1,
  },

  /* Empty state */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    color: t.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: t.textTertiary,
    fontSize: 14,
    marginTop: 6,
  },
});
