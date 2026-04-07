import React, { useState } from 'react';
import { t } from '../app/theme';
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
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function EditProfileScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const existingProfile = route.params?.profile || {};

  const [displayName, setDisplayName] = useState(existingProfile.display_name || '');
  const [bio, setBio] = useState(existingProfile.bio || '');
  const [location, setLocation] = useState(existingProfile.location || '');
  const [lookingFor, setLookingFor] = useState(existingProfile.looking_for || '');
  const [openToBrands, setOpenToBrands] = useState(existingProfile.open_to_brands || '');
  const [notInterestedIn, setNotInterestedIn] = useState(existingProfile.not_interested_in || '');
  const [paymentVenmo, setPaymentVenmo] = useState(existingProfile.payment_venmo || '');
  const [paymentZelle, setPaymentZelle] = useState(existingProfile.payment_zelle || '');
  const [paymentCashapp, setPaymentCashapp] = useState(existingProfile.payment_cashapp || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'You must be logged in.');
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          location: location.trim() || null,
          looking_for: lookingFor.trim() || null,
          open_to_brands: openToBrands.trim() || null,
          not_interested_in: notInterestedIn.trim() || null,
          payment_venmo: paymentVenmo.trim() || null,
          payment_zelle: paymentZelle.trim() || null,
          payment_cashapp: paymentCashapp.trim() || null,
        })
        .eq('id', session.user.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={t.textWhite} />
        </TouchableOpacity>

        <Text style={styles.screenTitle}>Edit Profile</Text>

        {/* Basic Info */}
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={t.textTertiary}
          value={displayName}
          onChangeText={setDisplayName}
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Tell swappers about yourself..."
          placeholderTextColor={t.textTertiary}
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. New York, NY"
          placeholderTextColor={t.textTertiary}
          value={location}
          onChangeText={setLocation}
        />

        {/* What You're Looking For */}
        <View style={styles.lookingForSection}>
          <View style={styles.lookingForHeader}>
            <Ionicons name="search" size={20} color={t.coral} />
            <Text style={styles.lookingForTitle}>What You're Looking For</Text>
          </View>
          <Text style={styles.lookingForSubtitle}>
            Help swappers know what to offer you
          </Text>

          <Text style={styles.labelLight}>Looking for</Text>
          <TextInput
            style={[styles.inputLight, styles.multilineInput]}
            placeholder="e.g. oversized leather jacket, size small tops, neutral boots..."
            placeholderTextColor={t.textTertiary}
            value={lookingFor}
            onChangeText={setLookingFor}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.labelLight}>Open to brands</Text>
          <TextInput
            style={styles.inputLight}
            placeholder="e.g. any brands, Nike, Zara..."
            placeholderTextColor={t.textTertiary}
            value={openToBrands}
            onChangeText={setOpenToBrands}
          />

          <Text style={styles.labelLight}>Not interested in</Text>
          <TextInput
            style={styles.inputLight}
            placeholder="e.g. fast fashion, damaged items..."
            placeholderTextColor={t.textTertiary}
            value={notInterestedIn}
            onChangeText={setNotInterestedIn}
          />
        </View>

        {/* Payment Methods */}
        <View style={styles.paymentSection}>
          <View style={styles.lookingForHeader}>
            <Ionicons name="cash-outline" size={20} color={t.coral} />
            <Text style={styles.lookingForTitle}>Payment Methods</Text>
          </View>
          <Text style={styles.lookingForSubtitle}>
            For swap + cash deals. Shown to the other person after a swap is accepted.
          </Text>

          <Text style={styles.labelLight}>Venmo</Text>
          <TextInput
            style={styles.inputLight}
            placeholder="@your-venmo"
            placeholderTextColor={t.textTertiary}
            autoCapitalize="none"
            value={paymentVenmo}
            onChangeText={setPaymentVenmo}
          />

          <Text style={styles.labelLight}>Zelle</Text>
          <TextInput
            style={styles.inputLight}
            placeholder="Phone or email"
            placeholderTextColor={t.textTertiary}
            autoCapitalize="none"
            value={paymentZelle}
            onChangeText={setPaymentZelle}
          />

          <Text style={styles.labelLight}>Cash App</Text>
          <TextInput
            style={styles.inputLight}
            placeholder="$your-cashtag"
            placeholderTextColor={t.textTertiary}
            autoCapitalize="none"
            value={paymentCashapp}
            onChangeText={setPaymentCashapp}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={t.textWhite} />
          ) : (
            <Text style={styles.saveButtonText}>Save Profile</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: t.text,
    marginBottom: 24,
  },

  // Labels
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: t.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },

  // Inputs
  input: {
    backgroundColor: t.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: t.text,
    borderWidth: 1,
    borderColor: t.separator,
  },
  multilineInput: {
    minHeight: 90,
    paddingTop: 14,
  },

  // Looking For section
  lookingForSection: {
    marginTop: 28,
    backgroundColor: t.cardAlt,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#FF6B6B40',
  },
  lookingForHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  lookingForTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: t.text,
  },
  lookingForSubtitle: {
    fontSize: 13,
    color: t.textTertiary,
    marginBottom: 16,
    lineHeight: 18,
  },
  labelLight: {
    fontSize: 14,
    fontWeight: '600',
    color: t.textSecondary,
    marginBottom: 8,
    marginTop: 10,
  },
  inputLight: {
    backgroundColor: '#1a1a1e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: t.text,
    borderWidth: 1,
    borderColor: t.separator,
  },

  // Payment section
  paymentSection: {
    marginTop: 28,
    backgroundColor: t.cardAlt,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#FF6B6B40',
  },

  // Save button
  saveButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: t.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
