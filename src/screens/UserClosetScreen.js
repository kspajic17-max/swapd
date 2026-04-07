import React, { useState, useEffect, useCallback } from 'react';
import { t } from '../app/theme';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;

export default function UserClosetScreen({ route, navigation }) {
  const { userId, username: usernameParam } = route.params;
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch profile by userId or username
      let profileRes;
      if (userId) {
        profileRes = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
      } else if (usernameParam) {
        profileRes = await supabase
          .from('profiles')
          .select('*')
          .eq('username', usernameParam)
          .single();
      } else {
        return;
      }

      if (profileRes.error) {
        console.error('Error fetching user profile:', profileRes.error);
        return;
      }

      const profileData = profileRes.data;
      setProfile(profileData);

      // Fetch their active listings with cover images
      const listingsRes = await supabase
        .from('listings')
        .select('*, listing_images(image_url, display_order)')
        .eq('user_id', profileData.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (listingsRes.error) {
        console.error('Error fetching user listings:', listingsRes.error);
      } else {
        const processed = (listingsRes.data || []).map((listing) => {
          const images = listing.listing_images || [];
          const sorted = images.sort(
            (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
          );
          return {
            ...listing,
            coverImage: sorted.length > 0 ? sorted[0].image_url : null,
          };
        });
        setListings(processed);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }
  }, [userId, usernameParam]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleItemPress = (item) => {
    navigation.navigate('ListingDetail', { listingId: item.id });
  };

  const getInitials = () => {
    if (!profile) return '?';
    if (profile.display_name) {
      const parts = profile.display_name.trim().split(/\s+/);
      return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
    }
    if (profile.username) {
      return profile.username[0].toUpperCase();
    }
    return '?';
  };

  const formatJoinDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const renderHeader = () => {
    if (!profile) return null;

    return (
      <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
        {/* Back button */}
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 8 }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={26} color={t.textWhite} />
        </TouchableOpacity>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{getInitials()}</Text>
            </View>
          )}
        </View>

        {/* Username + .edu badge */}
        <View style={styles.usernameRow}>
          <Text style={styles.username}>@{profile.username || 'user'}</Text>
          {profile.edu_verified && (
            <View style={styles.eduBadge}>
              <Ionicons name="checkmark-circle" size={16} color={t.coral} />
              <Text style={styles.eduBadgeText}>.edu verified</Text>
            </View>
          )}
        </View>

        {/* Display name */}
        {profile.display_name ? (
          <Text style={styles.displayName}>{profile.display_name}</Text>
        ) : null}

        {/* Bio */}
        {profile.bio ? (
          <Text style={styles.bio}>{profile.bio}</Text>
        ) : null}

        {/* Location */}
        {profile.location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-sharp" size={14} color={t.coral} />
            <Text style={styles.locationText}>{profile.location}</Text>
          </View>
        ) : null}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{listings.length}</Text>
            <Text style={styles.statLabel}>items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>swaps</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{formatJoinDate(profile.created_at)}</Text>
            <Text style={styles.statLabel}>joined</Text>
          </View>
        </View>

        {/* What They're Looking For */}
        {profile.looking_for || profile.open_to_brands || profile.not_interested_in ? (
          <View style={styles.lookingForCard}>
            <View style={styles.lookingForCardHeader}>
              <Ionicons name="search" size={16} color={t.coral} />
              <Text style={styles.lookingForCardTitle}>What They're Looking For</Text>
            </View>
            {profile.looking_for ? (
              <Text style={styles.lookingForCardText}>{profile.looking_for}</Text>
            ) : null}
            {profile.open_to_brands ? (
              <View style={styles.lookingForCardRow}>
                <Text style={styles.lookingForCardLabel}>Open to:</Text>
                <Text style={styles.lookingForCardValue}>{profile.open_to_brands}</Text>
              </View>
            ) : null}
            {profile.not_interested_in ? (
              <View style={styles.lookingForCardRow}>
                <Text style={styles.lookingForCardLabel}>Not into:</Text>
                <Text style={styles.lookingForCardValue}>{profile.not_interested_in}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Closet label */}
        <View style={styles.closetLabelContainer}>
          <Text style={styles.closetLabelText}>Closet</Text>
          <View style={styles.closetLabelUnderline} />
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="shirt-outline" size={56} color={t.textTertiary} />
      <Text style={styles.emptyTitle}>No items yet</Text>
      <Text style={styles.emptySubtitle}>
        This closet is empty for now.
      </Text>
    </View>
  );

  const renderGridItem = ({ item, index }) => {
    const isLeftEdge = index % 3 === 0;

    return (
      <TouchableOpacity
        style={[
          styles.gridItem,
          { marginLeft: isLeftEdge ? 0 : GRID_GAP },
        ]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.85}
      >
        {item.coverImage ? (
          <Image
            source={{ uri: item.coverImage }}
            style={styles.gridImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.gridImagePlaceholder}>
            <Ionicons name="image-outline" size={28} color={t.textTertiary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={t.background} />
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />
      {listings.length > 0 ? (
        <FlatList
          data={listings}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id.toString()}
          numColumns={3}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
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
      ) : (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
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
      )}
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
  listContent: {
    paddingBottom: 120,
    flexGrow: 1,
  },

  /* Header */
  headerContainer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 0,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Avatar */
  avatarContainer: {
    marginBottom: 14,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: t.card,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FF6B6B',
    fontSize: 28,
    fontWeight: '700',
  },

  /* Text info */
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    color: t.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  eduBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  eduBadgeText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  displayName: {
    color: t.textTertiary,
    fontSize: 15,
    marginTop: 2,
  },
  bio: {
    color: t.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  locationText: {
    color: t.textTertiary,
    fontSize: 13,
  },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    color: t.text,
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: t.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#2a2a2a',
  },

  /* Looking For card */
  lookingForCard: {
    marginTop: 18,
    marginHorizontal: 20,
    backgroundColor: t.cardAlt,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FF6B6B40',
    width: SCREEN_WIDTH - 40,
  },
  lookingForCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  lookingForCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: t.text,
  },
  lookingForCardText: {
    fontSize: 14,
    color: t.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  lookingForCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  lookingForCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B6B',
    marginRight: 6,
  },
  lookingForCardValue: {
    fontSize: 13,
    color: t.textTertiary,
    flex: 1,
  },

  /* Closet label (replaces tab switcher) */
  closetLabelContainer: {
    marginTop: 22,
    width: '100%',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
    paddingBottom: 12,
  },
  closetLabelText: {
    color: t.text,
    fontSize: 14,
    fontWeight: '600',
  },
  closetLabelUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '20%',
    backgroundColor: '#FF6B6B',
    borderRadius: 1,
  },

  /* Grid */
  gridItem: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    marginBottom: GRID_GAP,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: t.placeholder,
  },
  gridImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: t.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Empty state */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
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
    textAlign: 'center',
    lineHeight: 20,
  },
});
