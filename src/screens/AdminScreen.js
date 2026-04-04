import React, { useState, useEffect, useCallback } import { t } from '../app/theme';
import 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ADMIN_EMAILS = ['kspajic17@gmail.com'];

const TABS = ['All Users', 'Match Maker', 'Manual Message'];

export default function AdminScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('All Users');
  const [adminUserId, setAdminUserId] = useState(null);

  // All Users tab
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Match Maker tab
  const [allListings, setAllListings] = useState([]);
  const [matchesMap, setMatchesMap] = useState({});
  const [matchLoading, setMatchLoading] = useState(false);
  const [sendingMatch, setSendingMatch] = useState({});

  // Manual Message tab
  const [userA, setUserA] = useState(null);
  const [userB, setUserB] = useState(null);
  const [listingA, setListingA] = useState(null);
  const [listingB, setListingB] = useState(null);
  const [userAListings, setUserAListings] = useState([]);
  const [userBListings, setUserBListings] = useState([]);
  const [manualMessage, setManualMessage] = useState('');
  const [pickingUser, setPickingUser] = useState(null); // 'A' or 'B' or null
  const [pickingListing, setPickingListing] = useState(null); // 'A' or 'B' or null
  const [sendingManual, setSendingManual] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }
      const email = data.session.user.email;
      setAdminUserId(data.session.user.id);
      setIsAdmin(ADMIN_EMAILS.includes(email));
    } catch (e) {
      setIsAdmin(false);
    }
    setChecking(false);
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'All Users') {
      fetchUsers();
    } else if (isAdmin && activeTab === 'Match Maker') {
      fetchAllListings();
    } else if (isAdmin && activeTab === 'Manual Message' && users.length === 0) {
      fetchUsers();
    }
  }, [isAdmin, activeTab]);

  // ── All Users ──
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching profiles:', error);
        setUsersLoading(false);
        return;
      }

      // Get item counts per user
      const { data: listingCounts, error: lcError } = await supabase
        .from('listings')
        .select('user_id')
        .eq('status', 'active');

      const countMap = {};
      (listingCounts || []).forEach((l) => {
        countMap[l.user_id] = (countMap[l.user_id] || 0) + 1;
      });

      const enriched = (profiles || []).map((p) => ({
        ...p,
        itemCount: countMap[p.id] || 0,
      }));

      setUsers(enriched);
    } catch (err) {
      console.error('Unexpected error:', err);
    }
    setUsersLoading(false);
  };

  // ── Match Maker ──
  const fetchAllListings = async () => {
    setMatchLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*, profiles(id, username, avatar_url, display_name, location, looking_for, open_to_brands), listing_images(image_url, display_order)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching listings:', error);
        setMatchLoading(false);
        return;
      }

      const processed = (data || []).map((listing) => {
        const images = listing.listing_images || [];
        const sorted = images.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
        return {
          ...listing,
          coverImage: sorted.length > 0 ? sorted[0].image_url : null,
          username: listing.profiles?.username || 'unknown',
        };
      });

      setAllListings(processed);
      computeAllMatches(processed);
    } catch (err) {
      console.error('Unexpected error:', err);
    }
    setMatchLoading(false);
  };

  const computeAllMatches = (listings) => {
    const map = {};

    listings.forEach((listing) => {
      const myCategory = (listing.category || '').toLowerCase();
      const mySize = (listing.size || '').toLowerCase();
      const myBrand = (listing.brand || '').toLowerCase();
      const myTags = (listing.tags || []).map((t) => t.toLowerCase());
      const myValue = Number(listing.estimated_value) || 0;
      const myTitleWords = (listing.title || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);

      const candidates = [];

      listings.forEach((other) => {
        if (other.id === listing.id || other.user_id === listing.user_id) return;

        const theirCategory = (other.category || '').toLowerCase();
        const theirSize = (other.size || '').toLowerCase();
        const theirBrand = (other.brand || '').toLowerCase();
        const theirTags = (other.tags || []).map((t) => t.toLowerCase());
        const theirValue = Number(other.estimated_value) || 0;

        let score = 0;

        // Size match
        if (mySize && theirSize && mySize === theirSize) score += 3;

        // Category match
        if (myCategory && theirCategory && myCategory === theirCategory) score += 3;

        // Tag overlap
        theirTags.forEach((t) => {
          if (myTags.includes(t)) score += 2;
        });

        // Brand match
        if (myBrand && theirBrand && myBrand === theirBrand) score += 2;

        // Value proximity
        if (myValue > 0 && theirValue > 0) {
          const ratio = myValue > theirValue ? theirValue / myValue : myValue / theirValue;
          if (ratio >= 0.75) score += 3;
          else if (ratio >= 0.5) score += 1;
        }

        // Looking_for match
        const theirLookingFor = (other.profiles?.looking_for || '').toLowerCase();
        if (theirLookingFor) {
          const lfWords = theirLookingFor.split(/\s+/).filter((w) => w.length > 2);
          const hasMatch = lfWords.some(
            (w) => myCategory.includes(w) || myTitleWords.some((tw) => tw.includes(w)) || myBrand.includes(w)
          );
          if (hasMatch) score += 2;
        }

        if (score >= 4) {
          candidates.push({ listing: other, score });
        }
      });

      candidates.sort((a, b) => b.score - a.score);
      map[listing.id] = candidates.slice(0, 3);
    });

    setMatchesMap(map);
  };

  const handleSendSuggestion = async (listingA, listingB, matchScore) => {
    const key = `${listingA.id}-${listingB.id}`;
    if (sendingMatch[key]) return;

    setSendingMatch((prev) => ({ ...prev, [key]: true }));

    try {
      // Create swap_interest: User B interested in User A's listing
      const { data: interest, error: interestError } = await supabase
        .from('swap_interests')
        .insert({
          interested_user_id: listingB.user_id,
          listing_id: listingA.id,
          message: `[swapd team] We think @${listingB.username}'s ${listingB.title} would be a great swap for your ${listingA.title}!`,
          status: 'pending',
        })
        .select()
        .single();

      if (interestError) {
        Alert.alert('Error', interestError.message);
        setSendingMatch((prev) => ({ ...prev, [key]: false }));
        return;
      }

      // Send message to User A (listing owner)
      await supabase.from('messages').insert({
        interest_id: interest.id,
        sender_id: adminUserId,
        content: `[swapd team] swapd match! We think @${listingB.username}'s ${listingB.title} would be a great swap for your ${listingA.title}. Check it out!`,
      });

      // Send message to User B
      await supabase.from('messages').insert({
        interest_id: interest.id,
        sender_id: adminUserId,
        content: `[swapd team] swapd match! @${listingA.username}'s ${listingA.title} could be a great swap for your ${listingB.title}. Take a look!`,
      });

      // Save as featured match
      await supabase.from('featured_matches').insert({
        listing_a_id: listingA.id,
        listing_b_id: listingB.id,
        admin_note: `Auto-suggested, score: ${matchScore}`,
        status: 'active',
      });

      Alert.alert('Sent', `Suggestion sent to @${listingA.username} and @${listingB.username}`);
    } catch (err) {
      Alert.alert('Error', 'Failed to send suggestion');
    }

    setSendingMatch((prev) => ({ ...prev, [key]: false }));
  };

  // ── Manual Message ──
  const fetchUserListings = async (userId, target) => {
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(image_url, display_order)')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) return;

      const processed = (data || []).map((listing) => {
        const images = listing.listing_images || [];
        const sorted = images.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
        return {
          ...listing,
          coverImage: sorted.length > 0 ? sorted[0].image_url : null,
        };
      });

      if (target === 'A') setUserAListings(processed);
      else setUserBListings(processed);
    } catch (err) {
      console.error('Error fetching user listings:', err);
    }
  };

  const handlePickUser = (user, target) => {
    if (target === 'A') {
      setUserA(user);
      setListingA(null);
      fetchUserListings(user.id, 'A');
    } else {
      setUserB(user);
      setListingB(null);
      fetchUserListings(user.id, 'B');
    }
    setPickingUser(null);
  };

  const handlePickListing = (listing, target) => {
    if (target === 'A') setListingA(listing);
    else setListingB(listing);
    setPickingListing(null);
  };

  const handleSendManual = async () => {
    if (!userA || !userB || !listingA || !listingB) {
      Alert.alert('Missing', 'Please select both users and listings');
      return;
    }

    setSendingManual(true);
    try {
      // Create swap_interest
      const { data: interest, error: interestError } = await supabase
        .from('swap_interests')
        .insert({
          interested_user_id: userB.id,
          listing_id: listingA.id,
          message: manualMessage
            ? `[swapd team] ${manualMessage}`
            : `[swapd team] We paired your closets! Check out this potential swap.`,
          status: 'pending',
        })
        .select()
        .single();

      if (interestError) {
        Alert.alert('Error', interestError.message);
        setSendingManual(false);
        return;
      }

      // Message to User A
      await supabase.from('messages').insert({
        interest_id: interest.id,
        sender_id: adminUserId,
        content: `[swapd team] swapd match! We think @${userB.username}'s ${listingB.title} would be a great swap for your ${listingA.title}. Check it out!`,
      });

      // Message to User B
      await supabase.from('messages').insert({
        interest_id: interest.id,
        sender_id: adminUserId,
        content: `[swapd team] swapd match! @${userA.username} is interested in swapping their ${listingA.title} for your ${listingB.title}. Take a look!`,
      });

      // Save as featured match
      await supabase.from('featured_matches').insert({
        listing_a_id: listingA.id,
        listing_b_id: listingB.id,
        admin_note: manualMessage || 'Manual match by admin',
        status: 'active',
      });

      Alert.alert('Sent', 'Swap interest and messages created!');
      setUserA(null);
      setUserB(null);
      setListingA(null);
      setListingB(null);
      setManualMessage('');
    } catch (err) {
      Alert.alert('Error', 'Failed to send');
    }
    setSendingManual(false);
  };

  // ── Renders ──

  if (checking) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="dark-content" backgroundColor={t.background} />
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="dark-content" backgroundColor={t.background} />
        <Ionicons name="lock-closed" size={48} color={t.textTertiary} />
        <Text style={styles.deniedText}>Access denied</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderUserItem = ({ item }) => (
    <TouchableOpacity
      style={styles.userRow}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('UserCloset', { userId: item.id })}
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
      ) : (
        <View style={styles.userAvatarPlaceholder}>
          <Ionicons name="person" size={20} color={t.textTertiary} />
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userUsername}>@{item.username || 'user'}</Text>
        {item.display_name ? (
          <Text style={styles.userDisplayName}>{item.display_name}</Text>
        ) : null}
        <View style={styles.userMetaRow}>
          {item.location ? (
            <View style={styles.userMetaChip}>
              <Ionicons name="location-sharp" size={11} color={t.coral} />
              <Text style={styles.userMetaText}>{item.location}</Text>
            </View>
          ) : null}
          <View style={styles.userMetaChip}>
            <Ionicons name="shirt-outline" size={11} color={t.textTertiary} />
            <Text style={styles.userMetaText}>{item.itemCount} items</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.textTertiary} />
    </TouchableOpacity>
  );

  const renderMatchListing = ({ item: listing }) => {
    const matches = matchesMap[listing.id] || [];
    if (matches.length === 0) return null;

    return (
      <View style={styles.matchCard}>
        {/* Source listing */}
        <View style={styles.matchSource}>
          {listing.coverImage ? (
            <Image source={{ uri: listing.coverImage }} style={styles.matchThumb} />
          ) : (
            <View style={styles.matchThumbPlaceholder}>
              <Ionicons name="image-outline" size={18} color={t.textTertiary} />
            </View>
          )}
          <View style={styles.matchSourceInfo}>
            <Text style={styles.matchSourceTitle} numberOfLines={1}>{listing.title}</Text>
            <Text style={styles.matchSourceUser}>@{listing.username}</Text>
            <Text style={styles.matchSourceMeta}>
              {[listing.size, listing.brand, listing.category].filter(Boolean).join(' / ')}
            </Text>
          </View>
        </View>

        {/* Top matches */}
        {matches.map((match, idx) => {
          const other = match.listing;
          const key = `${listing.id}-${other.id}`;
          const isSending = sendingMatch[key];

          return (
            <View key={key} style={styles.matchRow}>
              <View style={styles.matchArrow}>
                <Ionicons name="swap-horizontal" size={14} color={t.coral} />
                <Text style={styles.matchScore}>{match.score}</Text>
              </View>
              {other.coverImage ? (
                <Image source={{ uri: other.coverImage }} style={styles.matchThumbSmall} />
              ) : (
                <View style={styles.matchThumbSmallPlaceholder}>
                  <Ionicons name="image-outline" size={14} color={t.textTertiary} />
                </View>
              )}
              <View style={styles.matchRowInfo}>
                <Text style={styles.matchRowTitle} numberOfLines={1}>{other.title}</Text>
                <Text style={styles.matchRowUser}>@{other.username}</Text>
              </View>
              <TouchableOpacity
                style={[styles.suggestBtn, isSending && styles.suggestBtnDisabled]}
                activeOpacity={0.7}
                disabled={isSending}
                onPress={() => handleSendSuggestion(listing, other, match.score)}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={t.textWhite} />
                ) : (
                  <Text style={styles.suggestBtnText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  // Filter listings that have matches
  const listingsWithMatches = allListings.filter((l) => (matchesMap[l.id] || []).length > 0);

  const renderPickerOverlay = () => {
    if (!pickingUser && !pickingListing) return null;

    let title = '';
    let data = [];
    let renderItem = null;

    if (pickingUser) {
      title = `Pick User ${pickingUser}`;
      data = users;
      renderItem = ({ item }) => (
        <TouchableOpacity
          style={styles.pickerItem}
          onPress={() => handlePickUser(item, pickingUser)}
        >
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.pickerAvatar} />
          ) : (
            <View style={styles.pickerAvatarPlaceholder}>
              <Ionicons name="person" size={16} color={t.textTertiary} />
            </View>
          )}
          <Text style={styles.pickerItemText}>@{item.username || 'user'}</Text>
          <Text style={styles.pickerItemSub}>{item.itemCount} items</Text>
        </TouchableOpacity>
      );
    } else if (pickingListing) {
      title = `Pick Listing (User ${pickingListing})`;
      data = pickingListing === 'A' ? userAListings : userBListings;
      renderItem = ({ item }) => (
        <TouchableOpacity
          style={styles.pickerItem}
          onPress={() => handlePickListing(item, pickingListing)}
        >
          {item.coverImage ? (
            <Image source={{ uri: item.coverImage }} style={styles.pickerThumb} />
          ) : (
            <View style={styles.pickerThumbPlaceholder}>
              <Ionicons name="image-outline" size={14} color={t.textTertiary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerItemText} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.pickerItemSub}>{[item.size, item.brand].filter(Boolean).join(' / ')}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={[styles.pickerOverlay, { paddingTop: insets.top }]}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>{title}</Text>
          <TouchableOpacity onPress={() => { setPickingUser(null); setPickingListing(null); }}>
            <Ionicons name="close" size={24} color={t.textWhite} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.pickerList}
        />
      </View>
    );
  };

  const renderManualTab = () => (
    <ScrollView style={styles.manualContainer} contentContainerStyle={styles.manualContent}>
      <Text style={styles.manualTitle}>Create Manual Match</Text>
      <Text style={styles.manualSubtitle}>
        Pick two users and one listing from each to create a swap suggestion.
      </Text>

      {/* User A */}
      <Text style={styles.manualLabel}>User A</Text>
      <TouchableOpacity
        style={styles.manualPicker}
        onPress={() => { if (users.length === 0) fetchUsers(); setPickingUser('A'); }}
      >
        {userA ? (
          <View style={styles.manualPickerSelected}>
            {userA.avatar_url ? (
              <Image source={{ uri: userA.avatar_url }} style={styles.manualPickerAvatar} />
            ) : (
              <View style={styles.manualPickerAvatarPlaceholder}>
                <Ionicons name="person" size={14} color={t.textTertiary} />
              </View>
            )}
            <Text style={styles.manualPickerText}>@{userA.username}</Text>
          </View>
        ) : (
          <Text style={styles.manualPickerPlaceholder}>Tap to select User A</Text>
        )}
        <Ionicons name="chevron-down" size={18} color={t.textTertiary} />
      </TouchableOpacity>

      {/* Listing A */}
      {userA && (
        <>
          <Text style={styles.manualLabel}>Listing from @{userA.username}</Text>
          <TouchableOpacity
            style={styles.manualPicker}
            onPress={() => setPickingListing('A')}
          >
            {listingA ? (
              <View style={styles.manualPickerSelected}>
                {listingA.coverImage ? (
                  <Image source={{ uri: listingA.coverImage }} style={styles.manualPickerThumb} />
                ) : null}
                <Text style={styles.manualPickerText} numberOfLines={1}>{listingA.title}</Text>
              </View>
            ) : (
              <Text style={styles.manualPickerPlaceholder}>Tap to select a listing</Text>
            )}
            <Ionicons name="chevron-down" size={18} color={t.textTertiary} />
          </TouchableOpacity>
        </>
      )}

      {/* User B */}
      <Text style={[styles.manualLabel, { marginTop: 20 }]}>User B</Text>
      <TouchableOpacity
        style={styles.manualPicker}
        onPress={() => { if (users.length === 0) fetchUsers(); setPickingUser('B'); }}
      >
        {userB ? (
          <View style={styles.manualPickerSelected}>
            {userB.avatar_url ? (
              <Image source={{ uri: userB.avatar_url }} style={styles.manualPickerAvatar} />
            ) : (
              <View style={styles.manualPickerAvatarPlaceholder}>
                <Ionicons name="person" size={14} color={t.textTertiary} />
              </View>
            )}
            <Text style={styles.manualPickerText}>@{userB.username}</Text>
          </View>
        ) : (
          <Text style={styles.manualPickerPlaceholder}>Tap to select User B</Text>
        )}
        <Ionicons name="chevron-down" size={18} color={t.textTertiary} />
      </TouchableOpacity>

      {/* Listing B */}
      {userB && (
        <>
          <Text style={styles.manualLabel}>Listing from @{userB.username}</Text>
          <TouchableOpacity
            style={styles.manualPicker}
            onPress={() => setPickingListing('B')}
          >
            {listingB ? (
              <View style={styles.manualPickerSelected}>
                {listingB.coverImage ? (
                  <Image source={{ uri: listingB.coverImage }} style={styles.manualPickerThumb} />
                ) : null}
                <Text style={styles.manualPickerText} numberOfLines={1}>{listingB.title}</Text>
              </View>
            ) : (
              <Text style={styles.manualPickerPlaceholder}>Tap to select a listing</Text>
            )}
            <Ionicons name="chevron-down" size={18} color={t.textTertiary} />
          </TouchableOpacity>
        </>
      )}

      {/* Admin note */}
      <Text style={[styles.manualLabel, { marginTop: 20 }]}>Message (optional)</Text>
      <TextInput
        style={styles.manualInput}
        placeholder="Custom message to both users..."
        placeholderTextColor={t.textTertiary}
        value={manualMessage}
        onChangeText={setManualMessage}
        multiline
      />

      {/* Preview */}
      {listingA && listingB && (
        <View style={styles.manualPreview}>
          <Text style={styles.manualPreviewTitle}>Preview</Text>
          <View style={styles.manualPreviewPair}>
            <View style={styles.manualPreviewSide}>
              {listingA.coverImage ? (
                <Image source={{ uri: listingA.coverImage }} style={styles.manualPreviewImg} />
              ) : (
                <View style={styles.manualPreviewImgPlaceholder}>
                  <Ionicons name="image-outline" size={20} color={t.textTertiary} />
                </View>
              )}
              <Text style={styles.manualPreviewItemTitle} numberOfLines={1}>{listingA.title}</Text>
              <Text style={styles.manualPreviewUser}>@{userA.username}</Text>
            </View>
            <Ionicons name="swap-horizontal" size={20} color={t.coral} style={{ marginHorizontal: 8 }} />
            <View style={styles.manualPreviewSide}>
              {listingB.coverImage ? (
                <Image source={{ uri: listingB.coverImage }} style={styles.manualPreviewImg} />
              ) : (
                <View style={styles.manualPreviewImgPlaceholder}>
                  <Ionicons name="image-outline" size={20} color={t.textTertiary} />
                </View>
              )}
              <Text style={styles.manualPreviewItemTitle} numberOfLines={1}>{listingB.title}</Text>
              <Text style={styles.manualPreviewUser}>@{userB.username}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Send button */}
      <TouchableOpacity
        style={[
          styles.manualSendBtn,
          (!userA || !userB || !listingA || !listingB) && styles.manualSendBtnDisabled,
        ]}
        activeOpacity={0.7}
        disabled={!userA || !userB || !listingA || !listingB || sendingManual}
        onPress={handleSendManual}
      >
        {sendingManual ? (
          <ActivityIndicator size="small" color={t.textWhite} />
        ) : (
          <>
            <Ionicons name="send" size={16} color={t.textWhite} style={{ marginRight: 8 }} />
            <Text style={styles.manualSendBtnText}>Create Match & Send Messages</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={22} color={t.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {activeTab === 'All Users' && (
        usersLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={t.coral} />
          </View>
        ) : (
          <FlatList
            data={users}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )
      )}

      {activeTab === 'Match Maker' && (
        matchLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={t.coral} />
          </View>
        ) : (
          <FlatList
            data={listingsWithMatches}
            renderItem={renderMatchListing}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No matches found</Text>
              </View>
            }
          />
        )
      )}

      {activeTab === 'Manual Message' && renderManualTab()}

      {/* Picker overlay */}
      {renderPickerOverlay()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.background,
  },
  deniedText: {
    color: t.textTertiary,
    fontSize: 16,
    marginTop: 12,
  },
  backBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: t.card,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: t.background,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  headerBack: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF6B6B',
  },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: t.placeholder,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF6B6B',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: t.textTertiary,
  },
  tabTextActive: {
    color: '#FF6B6B',
  },

  listContent: {
    paddingBottom: 100,
  },

  /* All Users */
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.card,
  },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userUsername: {
    color: t.text,
    fontSize: 15,
    fontWeight: '600',
  },
  userDisplayName: {
    color: t.textTertiary,
    fontSize: 13,
    marginTop: 1,
  },
  userMetaRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 10,
  },
  userMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  userMetaText: {
    color: t.textTertiary,
    fontSize: 12,
  },

  /* Match Maker */
  matchCard: {
    marginHorizontal: 12,
    marginTop: 12,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  matchSource: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  matchThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: t.card,
  },
  matchThumbPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchSourceInfo: {
    flex: 1,
    marginLeft: 10,
  },
  matchSourceTitle: {
    color: t.text,
    fontSize: 14,
    fontWeight: '600',
  },
  matchSourceUser: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 2,
  },
  matchSourceMeta: {
    color: t.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  matchArrow: {
    alignItems: 'center',
    width: 30,
  },
  matchScore: {
    color: '#FF6B6B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  matchThumbSmall: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: t.card,
    marginLeft: 6,
  },
  matchThumbSmallPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  matchRowInfo: {
    flex: 1,
    marginLeft: 8,
  },
  matchRowTitle: {
    color: t.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  matchRowUser: {
    color: t.textTertiary,
    fontSize: 11,
    marginTop: 1,
  },
  suggestBtn: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
    minWidth: 54,
    alignItems: 'center',
  },
  suggestBtnDisabled: {
    backgroundColor: '#444',
  },
  suggestBtnText: {
    color: t.text,
    fontSize: 12,
    fontWeight: '700',
  },

  emptyText: {
    color: t.textTertiary,
    fontSize: 14,
  },

  /* Manual Message */
  manualContainer: {
    flex: 1,
  },
  manualContent: {
    padding: 16,
    paddingBottom: 100,
  },
  manualTitle: {
    color: t.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  manualSubtitle: {
    color: t.textTertiary,
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  manualLabel: {
    color: t.textTertiary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  manualPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    marginBottom: 8,
  },
  manualPickerSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  manualPickerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.card,
    marginRight: 10,
  },
  manualPickerAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  manualPickerThumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: t.card,
    marginRight: 10,
  },
  manualPickerText: {
    color: t.text,
    fontSize: 14,
    flex: 1,
  },
  manualPickerPlaceholder: {
    color: t.textTertiary,
    fontSize: 14,
  },
  manualInput: {
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: t.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  manualPreview: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    marginBottom: 16,
  },
  manualPreviewTitle: {
    color: t.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  manualPreviewPair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualPreviewSide: {
    flex: 1,
    alignItems: 'center',
  },
  manualPreviewImg: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: t.card,
  },
  manualPreviewImgPlaceholder: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualPreviewItemTitle: {
    color: t.text,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
  manualPreviewUser: {
    color: t.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  manualSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 8,
  },
  manualSendBtnDisabled: {
    backgroundColor: '#333',
  },
  manualSendBtnText: {
    color: t.text,
    fontSize: 15,
    fontWeight: '700',
  },

  /* Picker overlay */
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.background,
    zIndex: 100,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  pickerTitle: {
    color: t.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pickerList: {
    paddingBottom: 100,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.card,
    marginRight: 12,
  },
  pickerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pickerThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: t.card,
    marginRight: 12,
  },
  pickerThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pickerItemText: {
    color: t.text,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  pickerItemSub: {
    color: t.textTertiary,
    fontSize: 12,
  },
});
