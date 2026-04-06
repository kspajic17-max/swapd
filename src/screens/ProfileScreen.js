import React, { useState, useEffect, useCallback } from 'react';
import { t } from '../app/theme';
import 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;

const TABS = ['My Closet', 'Wishlist'];

const ADMIN_EMAILS = ['kspajic17@gmail.com'];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [activeTab, setActiveTab] = useState('My Closet');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return;
      setSession(currentSession);
      setIsAdmin(ADMIN_EMAILS.includes(currentSession.user.email));

      // Fetch profile — create one if it doesn't exist
      let profileRes = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .single();

      if (profileRes.error && profileRes.error.code === 'PGRST116') {
        // Profile doesn't exist — create it
        const meta = currentSession.user.user_metadata || {};
        await supabase.from('profiles').insert({
          id: currentSession.user.id,
          username: meta.username || 'user_' + currentSession.user.id.slice(0, 8),
          display_name: meta.display_name || meta.full_name || null,
          avatar_url: meta.avatar_url || null,
          edu_verified: meta.edu_verified || false,
        });
        profileRes = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentSession.user.id)
          .single();
      }

      if (profileRes.error) {
        console.error('Error fetching profile:', profileRes.error);
      } else {
        setProfile(profileRes.data);
      }

      const listingsRes = await supabase
        .from('listings')
        .select('*, listing_images(id, image_url, display_order)')
        .eq('user_id', currentSession.user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (listingsRes.error) {
        console.error('Error fetching listings:', listingsRes.error);
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
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSettingsPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Sign Out'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          title: 'Settings',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handleSignOut();
        }
      );
    } else {
      Alert.alert('Settings', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
      ]);
    }
  };

  const handleEditProfile = () => {
    navigation.navigate('EditProfile', { profile });
  };

  const handleItemPress = (item) => {
    navigation.navigate('ListingDetail', { listingId: item.id });
  };

  const handleItemLongPress = (item) => {
    Alert.alert(item.title, '', [
      {
        text: 'Edit',
        onPress: () => {
          const images = item.listing_images || [];
          const sorted = images.sort(
            (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
          );
          navigation.navigate('EditListing', { listing: { ...item, listing_images: sorted } });
        },
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
                    .eq('id', item.id);
                  if (error) {
                    Alert.alert('Error', error.message);
                  } else {
                    fetchData();
                  }
                },
              },
            ]
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
      <View style={[styles.headerContainer, { paddingTop: insets.top + 16 }]}>
        {/* Settings gear */}
        <TouchableOpacity
          style={[styles.settingsButton, { top: insets.top + 16 }]}
          onPress={handleSettingsPress}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={24} color={t.textTertiary} />
        </TouchableOpacity>

        {/* Admin button */}
        {isAdmin && (
          <TouchableOpacity
            style={[styles.adminButton, { top: insets.top + 16 }]}
            onPress={() => navigation.navigate('AdminScreen')}
            activeOpacity={0.7}
          >
            <Ionicons name="shield" size={18} color={t.coral} />
            <Text style={styles.adminButtonText}>Admin</Text>
          </TouchableOpacity>
        )}

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

        {/* Username */}
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

        {/* Edit Profile button */}
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEditProfile}
          activeOpacity={0.8}
        >
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        {/* What I'm Looking For */}
        {profile.looking_for || profile.open_to_brands || profile.not_interested_in ? (
          <View style={styles.lookingForCard}>
            <View style={styles.lookingForCardHeader}>
              <Ionicons name="search" size={16} color={t.coral} />
              <Text style={styles.lookingForCardTitle}>What I'm Looking For</Text>
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
        ) : (
          <TouchableOpacity
            style={styles.lookingForPrompt}
            onPress={handleEditProfile}
            activeOpacity={0.7}
          >
            <Text style={styles.lookingForPromptText}>
              Tap Edit Profile to tell swappers what you're looking for
            </Text>
          </TouchableOpacity>
        )}

        {/* Tab switcher */}
        <View style={styles.tabContainer}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={styles.tab}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab}
                </Text>
                {isActive && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderClosetEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="shirt-outline" size={56} color={t.textTertiary} />
      <Text style={styles.emptyTitle}>Your closet is empty</Text>
      <Text style={styles.emptySubtitle}>
        Start adding pieces to swap!
      </Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('CreateListing')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={20} color={t.textWhite} />
        <Text style={styles.addButtonText}>Add Your First Item</Text>
      </TouchableOpacity>
    </View>
  );

  const renderWishlistEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={56} color={t.textTertiary} />
      <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
      <Text style={styles.emptySubtitle}>
        Save items you love here
      </Text>
    </View>
  );

  const renderGridItem = ({ item, index }) => {
    const isLeftEdge = index % 3 === 0;
    const isRightEdge = index % 3 === 2;

    return (
      <TouchableOpacity
        style={[
          styles.gridItem,
          { marginLeft: isLeftEdge ? 0 : GRID_GAP },
        ]}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleItemLongPress(item)}
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

  const showGrid = activeTab === 'My Closet' && listings.length > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />
      {showGrid ? (
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
          ListFooterComponent={
            activeTab === 'My Closet' ? renderClosetEmpty : renderWishlistEmpty
          }
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
  settingsButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  adminButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  adminButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '700',
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

  /* Edit button */
  editButton: {
    marginTop: 18,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: t.separator,
  },
  editButtonText: {
    color: t.text,
    fontSize: 14,
    fontWeight: '600',
  },

  /* Tabs */
  tabContainer: {
    flexDirection: 'row',
    marginTop: 22,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
    width: '100%',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 12,
    position: 'relative',
  },
  tabText: {
    color: t.textTertiary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: t.text,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '60%',
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

  /* Empty states */
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 8,
  },
  addButtonText: {
    color: t.text,
    fontSize: 15,
    fontWeight: '700',
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
  lookingForPrompt: {
    marginTop: 14,
    paddingHorizontal: 20,
  },
  lookingForPromptText: {
    fontSize: 13,
    color: t.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
