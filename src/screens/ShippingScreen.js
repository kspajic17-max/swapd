import React, { useState, useEffect, useCallback } from 'react';
import { t } from '../app/theme';
import 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

export default function ShippingScreen({ navigation, route }) {
  const { offerId, interestId, otherUser } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  // My shipping record
  const [myShipping, setMyShipping] = useState(null);
  const [editing, setEditing] = useState(false);

  // Their shipping record
  const [theirShipping, setTheirShipping] = useState(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  // Offer acceptance date for ship-by calculation
  const [acceptedAt, setAcceptedAt] = useState(null);

  const otherUsername = otherUser?.username || otherUser?.display_name || 'them';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      const uid = sessionData.session.user.id;
      setUserId(uid);

      // Fetch the offer to get accepted timestamp
      const { data: offer } = await supabase
        .from('swap_offers')
        .select('status, updated_at')
        .eq('id', offerId)
        .single();

      if (offer) {
        setAcceptedAt(offer.updated_at);
      }

      // Fetch all shipping records for this offer
      const { data: shippingRecords, error } = await supabase
        .from('swap_shipping')
        .select('*')
        .eq('offer_id', offerId);

      if (error) {
        console.warn('Error fetching shipping:', error.message);
      }

      if (shippingRecords) {
        const mine = shippingRecords.find((r) => r.user_id === uid);
        const theirs = shippingRecords.find((r) => r.user_id !== uid);

        if (mine) {
          setMyShipping(mine);
          setFullName(mine.full_name || '');
          setStreet(mine.street || '');
          setCity(mine.city || '');
          setState(mine.state || '');
          setZip(mine.zip || '');
          setTrackingNumber(mine.tracking_number || '');
        }

        if (theirs) {
          setTheirShipping(theirs);
        }
      }
    } catch (err) {
      console.warn('Error loading shipping data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const getShipByDate = () => {
    if (!acceptedAt) return null;
    const date = new Date(acceptedAt);
    date.setDate(date.getDate() + 3);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleSaveAddress = async () => {
    if (!fullName.trim() || !street.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      Alert.alert('Missing fields', 'Please fill in all address fields.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        offer_id: offerId,
        user_id: userId,
        full_name: fullName.trim(),
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        updated_at: new Date().toISOString(),
      };

      if (myShipping) {
        // Update existing
        const { error } = await supabase
          .from('swap_shipping')
          .update(payload)
          .eq('id', myShipping.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('swap_shipping')
          .insert(payload);

        if (error) throw error;
      }

      setEditing(false);
      await loadData();
      Alert.alert('Saved', 'Your address has been saved.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save address.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkShipped = async () => {
    Alert.alert(
      'Confirm shipment',
      'Mark your items as shipped? This cannot be undone.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'I\'ve Shipped',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('swap_shipping')
                .update({
                  shipped: true,
                  shipped_at: new Date().toISOString(),
                  tracking_number: trackingNumber.trim() || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', myShipping.id);

              if (error) throw error;
              await loadData();
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not update shipping status.');
            }
          },
        },
      ]
    );
  };

  const handleSaveTracking = async () => {
    if (!myShipping) return;
    try {
      const { error } = await supabase
        .from('swap_shipping')
        .update({
          tracking_number: trackingNumber.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', myShipping.id);

      if (error) throw error;
      Alert.alert('Saved', 'Tracking number updated.');
      await loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save tracking number.');
    }
  };

  const bothShipped = myShipping?.shipped && theirShipping?.shipped;
  const bothAddressesFilled = myShipping?.full_name && theirShipping?.full_name;
  const myAddressFilled = myShipping?.full_name;

  const getSwapStatus = () => {
    if (bothShipped) return 'complete';
    if (myShipping?.shipped || theirShipping?.shipped) return 'partially_shipped';
    if (bothAddressesFilled) return 'ready_to_ship';
    if (myAddressFilled || theirShipping?.full_name) return 'waiting_for_addresses';
    return 'accepted';
  };

  const statusConfig = {
    accepted: { label: 'Swap Accepted', color: '#4CAF50', icon: 'checkmark-circle' },
    waiting_for_addresses: { label: 'Waiting for Addresses', color: '#FFA726', icon: 'time' },
    ready_to_ship: { label: 'Ready to Ship', color: '#42A5F5', icon: 'cube' },
    partially_shipped: { label: 'Shipping in Progress', color: '#FFA726', icon: 'airplane' },
    complete: { label: 'Swap Complete!', color: '#4CAF50', icon: 'checkmark-done-circle' },
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  const swapStatus = getSwapStatus();
  const config = statusConfig[swapStatus];
  const shipByDate = getShipByDate();
  const showAddressForm = !myAddressFilled || editing;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={t.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shipping Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <View style={[styles.statusCard, { borderColor: config.color + '40' }]}>
          <Ionicons name={config.icon} size={24} color={config.color} />
          <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
          {bothShipped && <Text style={styles.completeEmoji}>🎉</Text>}
        </View>

        {/* Ship by date */}
        {shipByDate && !bothShipped && (
          <View style={styles.shipByCard}>
            <Ionicons name="calendar-outline" size={16} color="#FFA726" />
            <Text style={styles.shipByText}>Please ship by {shipByDate}</Text>
          </View>
        )}

        {/* Your Shipping Address */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Shipping Address</Text>
            {myAddressFilled && !editing && (
              <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {showAddressForm ? (
            <View style={styles.formCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Jane Doe"
                  placeholderTextColor="#444"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Street Address</Text>
                <TextInput
                  style={styles.input}
                  value={street}
                  onChangeText={setStreet}
                  placeholder="123 Main St, Apt 4"
                  placeholderTextColor="#444"
                />
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 2 }]}>
                  <Text style={styles.inputLabel}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={city}
                    onChangeText={setCity}
                    placeholder="New York"
                    placeholderTextColor="#444"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.inputLabel}>State</Text>
                  <TextInput
                    style={styles.input}
                    value={state}
                    onChangeText={setState}
                    placeholder="NY"
                    placeholderTextColor="#444"
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.inputLabel}>ZIP</Text>
                  <TextInput
                    style={styles.input}
                    value={zip}
                    onChangeText={setZip}
                    placeholder="10001"
                    placeholderTextColor="#444"
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveAddress}
                activeOpacity={0.7}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={t.textWhite} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Address</Text>
                )}
              </TouchableOpacity>
              {editing && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditing(false);
                    // Reset to saved values
                    setFullName(myShipping?.full_name || '');
                    setStreet(myShipping?.street || '');
                    setCity(myShipping?.city || '');
                    setState(myShipping?.state || '');
                    setZip(myShipping?.zip || '');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.addressDisplay}>
              <Text style={styles.addressText}>{myShipping.full_name}</Text>
              <Text style={styles.addressText}>{myShipping.street}</Text>
              <Text style={styles.addressText}>
                {myShipping.city}, {myShipping.state} {myShipping.zip}
              </Text>
            </View>
          )}
        </View>

        {/* Their Shipping Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>@{otherUsername}'s Address</Text>
          {bothAddressesFilled ? (
            <View style={styles.addressDisplay}>
              <Text style={styles.addressText}>{theirShipping.full_name}</Text>
              <Text style={styles.addressText}>{theirShipping.street}</Text>
              <Text style={styles.addressText}>
                {theirShipping.city}, {theirShipping.state} {theirShipping.zip}
              </Text>
            </View>
          ) : (
            <View style={styles.waitingCard}>
              <Ionicons name="hourglass-outline" size={20} color={t.textTertiary} />
              <Text style={styles.waitingText}>
                {myAddressFilled
                  ? `Waiting for @${otherUsername} to enter their address`
                  : 'Enter your address first to see theirs'}
              </Text>
            </View>
          )}
        </View>

        {/* Tracking Number */}
        {myAddressFilled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tracking Number (Optional)</Text>
            <View style={styles.trackingRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                placeholder="Enter tracking number"
                placeholderTextColor="#444"
                autoCapitalize="characters"
              />
              {trackingNumber !== (myShipping?.tracking_number || '') && (
                <TouchableOpacity
                  style={styles.trackingSaveBtn}
                  onPress={handleSaveTracking}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark" size={18} color={t.textWhite} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Ship Status Indicators */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping Status</Text>
          <View style={styles.statusRow}>
            <Ionicons
              name={myShipping?.shipped ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={myShipping?.shipped ? '#4CAF50' : '#555'}
            />
            <Text style={[styles.statusRowText, myShipping?.shipped && styles.statusRowShipped]}>
              You: {myShipping?.shipped ? 'shipped ✓' : 'not yet shipped'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Ionicons
              name={theirShipping?.shipped ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={theirShipping?.shipped ? '#4CAF50' : '#555'}
            />
            <Text style={[styles.statusRowText, theirShipping?.shipped && styles.statusRowShipped]}>
              @{otherUsername}: {theirShipping?.shipped ? 'shipped ✓' : 'not yet shipped'}
            </Text>
          </View>
        </View>

        {/* I've Shipped button */}
        {myAddressFilled && !myShipping?.shipped && (
          <TouchableOpacity
            style={styles.shippedButton}
            onPress={handleMarkShipped}
            activeOpacity={0.7}
          >
            <Ionicons name="airplane" size={18} color={t.textWhite} style={{ marginRight: 8 }} />
            <Text style={styles.shippedButtonText}>I've Shipped</Text>
          </TouchableOpacity>
        )}

        {/* Swap Complete */}
        {bothShipped && (
          <View style={styles.completeCard}>
            <Text style={styles.completeTitle}>Swap complete! 🎉</Text>
            <Text style={styles.completeSubtitle}>
              Both items are on their way. Enjoy your new pieces!
            </Text>
            <TouchableOpacity
              style={styles.rateButton}
              onPress={() => Alert.alert('Coming soon', 'Rating feature is coming soon!')}
              activeOpacity={0.7}
            >
              <Ionicons name="star" size={16} color={t.textWhite} style={{ marginRight: 6 }} />
              <Text style={styles.rateButtonText}>Rate this swap</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: t.background,
    borderBottomWidth: 1,
    borderBottomColor: t.separator,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: t.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },

  // Status Card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    gap: 10,
  },
  statusLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  completeEmoji: {
    fontSize: 22,
  },

  // Ship by
  shipByCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA72615',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  shipByText: {
    color: '#FFA726',
    fontSize: 14,
    fontWeight: '600',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: t.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editLink: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },

  // Form
  formCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: t.textTertiary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: t.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: t.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: t.separator,
  },
  inputRow: {
    flexDirection: 'row',
  },
  saveButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    color: t.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    color: t.textTertiary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Address display
  addressDisplay: {
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 16,
  },
  addressText: {
    color: t.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },

  // Waiting
  waitingCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waitingText: {
    flex: 1,
    color: t.textTertiary,
    fontSize: 14,
    lineHeight: 20,
  },

  // Tracking
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackingSaveBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Status indicators
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  statusRowText: {
    color: t.textTertiary,
    fontSize: 15,
  },
  statusRowShipped: {
    color: '#4CAF50',
    fontWeight: '600',
  },

  // Shipped button
  shippedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 24,
  },
  shippedButtonText: {
    color: t.text,
    fontSize: 17,
    fontWeight: '700',
  },

  // Complete card
  completeCard: {
    backgroundColor: '#4CAF5015',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF5040',
  },
  completeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4CAF50',
    marginBottom: 8,
  },
  completeSubtitle: {
    color: t.textTertiary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA726',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  rateButtonText: {
    color: t.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
