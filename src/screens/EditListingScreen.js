import React, { useState, useEffect } import { t } from '../app/theme';
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
  Switch,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

const CATEGORIES = ['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Outerwear', 'Accessories', 'Bags', 'Jewelry'];
const SIZE_GENDERS = ["Women's", "Men's"];
const SIZES_BY_CATEGORY = {
  "Women's": {
    default: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '1X', '2X', '3X', 'One Size'],
    Tops: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '1X', '2X', '3X', 'One Size'],
    Bottoms: ['23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'],
    Dresses: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '00', '0', '2', '4', '6', '8', '10', '12', '14', '16', 'One Size'],
    Shoes: ['US 5', 'US 5.5', 'US 6', 'US 6.5', 'US 7', 'US 7.5', 'US 8', 'US 8.5', 'US 9', 'US 9.5', 'US 10', 'US 10.5', 'US 11', 'US 11.5', 'US 12'],
    Outerwear: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '1X', '2X', '3X', 'One Size'],
    Accessories: ['One Size'],
    Bags: ['One Size'],
    Jewelry: ['One Size'],
  },
  "Men's": {
    default: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One Size'],
    Tops: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One Size'],
    Bottoms: ['28', '29', '30', '31', '32', '33', '34', '36', '38', '40', '42', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'],
    Dresses: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'],
    Shoes: ['US 7', 'US 7.5', 'US 8', 'US 8.5', 'US 9', 'US 9.5', 'US 10', 'US 10.5', 'US 11', 'US 11.5', 'US 12', 'US 12.5', 'US 13', 'US 14', 'US 15'],
    Outerwear: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One Size'],
    Accessories: ['One Size'],
    Bags: ['One Size'],
    Jewelry: ['One Size'],
  },
};
const CONDITIONS = ['New with Tags', 'Like New', 'Good', 'Fair'];
const VIBE_TAGS = [
  'Going Out', 'Casual', 'Brunch', 'Party', 'Vacation', 'Streetwear',
  'Y2K', 'Vintage', 'Cottagecore', 'Minimalist', 'Sporty', 'Festival',
];
const MAX_PHOTOS = 8;

const CONDITION_FROM_DB = {
  new_with_tags: 'New with Tags',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const CATEGORY_FROM_DB = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  dresses: 'Dresses',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  accessories: 'Accessories',
};

const TAG_FROM_DB = {
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

function parseSizeField(sizeStr) {
  if (!sizeStr) return { gender: "Women's", size: '' };
  const match = sizeStr.match(/^(Women's|Men's)\s+(.+)$/);
  if (match) {
    return { gender: match[1], size: match[2] };
  }
  return { gender: "Women's", size: sizeStr };
}

export default function EditListingScreen({ route, navigation }) {
  const { listing } = route.params;

  const existingImages = (listing.listing_images || [])
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));

  const parsedSize = parseSizeField(listing.size);
  const mappedCategory = CATEGORY_FROM_DB[listing.category] || '';
  const mappedCondition = CONDITION_FROM_DB[listing.condition] || '';
  const mappedTags = (listing.tags || []).map((t) => TAG_FROM_DB[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

  // existingPhotos: objects with { id, image_url } from DB
  // newPhotos: local URIs from picker
  const [existingPhotos, setExistingPhotos] = useState(existingImages);
  const [newPhotos, setNewPhotos] = useState([]);
  const [removedImageIds, setRemovedImageIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState(listing.title || '');
  const [brand, setBrand] = useState(listing.brand || '');
  const [category, setCategory] = useState(mappedCategory);
  const [sizeGender, setSizeGender] = useState(parsedSize.gender);
  const [size, setSize] = useState(parsedSize.size);
  const [condition, setCondition] = useState(mappedCondition);
  const [color, setColor] = useState(listing.color || '');
  const [estimatedValue, setEstimatedValue] = useState(
    listing.estimated_value != null ? String(Number(listing.estimated_value)) : ''
  );
  const [openToSwapCash, setOpenToSwapCash] = useState(listing.open_to_swap_plus_cash || false);
  const [tags, setTags] = useState(mappedTags);
  const [description, setDescription] = useState(listing.description || '');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showVibeModal, setShowVibeModal] = useState(false);

  const totalPhotos = existingPhotos.length + newPhotos.length;

  const pickImage = async () => {
    if (totalPhotos >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - totalPhotos,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const added = result.assets.map((a) => a.uri);
      setNewPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS - existingPhotos.length));
    }
  };

  const takePhoto = async () => {
    if (totalPhotos >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your camera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      setNewPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleAddPhoto = () => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Photo Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeExistingPhoto = (imageId) => {
    setExistingPhotos((prev) => prev.filter((img) => img.id !== imageId));
    setRemovedImageIds((prev) => [...prev, imageId]);
  };

  const removeNewPhoto = (index) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const genderSizes = SIZES_BY_CATEGORY[sizeGender] || SIZES_BY_CATEGORY["Women's"];
  const currentSizes = genderSizes[category] || genderSizes.default;

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setSize('');
  };

  const handleGenderChange = (gender) => {
    setSizeGender(gender);
    setSize('');
  };

  const mapCategoryToDb = (cat) => {
    const mapping = {
      'Tops': 'tops',
      'Bottoms': 'bottoms',
      'Dresses': 'dresses',
      'Shoes': 'shoes',
      'Outerwear': 'outerwear',
      'Accessories': 'accessories',
      'Bags': 'accessories',
      'Jewelry': 'accessories',
    };
    return mapping[cat] || 'other';
  };

  const mapConditionToDb = (cond) => {
    const mapping = {
      'New with Tags': 'new_with_tags',
      'Like New': 'like_new',
      'Good': 'good',
      'Fair': 'fair',
    };
    return mapping[cond];
  };

  const mapTagToDb = (tag) => {
    return tag.toLowerCase().replace(/\s+/g, '_');
  };

  const toggleTag = (tag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = async () => {
    if (totalPhotos === 0) {
      Alert.alert('Missing photos', 'Please add at least one photo.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a title for your listing.');
      return;
    }
    if (!category) {
      Alert.alert('Missing category', 'Please select a category.');
      return;
    }
    if (!size) {
      Alert.alert('Missing size', 'Please select a size.');
      return;
    }
    if (!condition) {
      Alert.alert('Missing condition', 'Please select the item condition.');
      return;
    }

    setIsSaving(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        Alert.alert('Error', 'You must be logged in to edit a listing.');
        setIsSaving(false);
        return;
      }
      const userId = sessionData.session.user.id;

      const parsedValue = estimatedValue.trim()
        ? parseFloat(estimatedValue.trim()) || null
        : null;

      // Update listing
      const { error: updateError } = await supabase
        .from('listings')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          brand: brand.trim() || null,
          category: mapCategoryToDb(category),
          size: `${sizeGender} ${size}`,
          condition: mapConditionToDb(condition),
          color: color.trim() || null,
          estimated_value: parsedValue,
          open_to_swap_plus_cash: openToSwapCash,
          tags: tags.map(mapTagToDb),
        })
        .eq('id', listing.id);

      if (updateError) {
        throw updateError;
      }

      // Remove deleted images from DB
      if (removedImageIds.length > 0) {
        await supabase
          .from('listing_images')
          .delete()
          .in('id', removedImageIds);
      }

      // Update display_order for remaining existing images
      for (let i = 0; i < existingPhotos.length; i++) {
        await supabase
          .from('listing_images')
          .update({ display_order: i })
          .eq('id', existingPhotos[i].id);
      }

      // Upload new photos
      const startOrder = existingPhotos.length;
      for (let i = 0; i < newPhotos.length; i++) {
        try {
          const uri = newPhotos[i];
          const timestamp = Date.now();
          const filePath = `${userId}/${listing.id}/${timestamp}_${i}.jpg`;

          const response = await fetch(uri);
          const blob = await response.blob();
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result;
              const base64String = dataUrl.split(',')[1];
              resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }

          const { error: uploadError } = await supabase.storage
            .from('listing-images')
            .upload(filePath, bytes.buffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (uploadError) {
            console.error(`Upload error for photo ${i}:`, uploadError.message);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from('listing-images')
            .getPublicUrl(filePath);

          const publicUrl = urlData.publicUrl;

          await supabase
            .from('listing_images')
            .insert({
              listing_id: listing.id,
              image_url: publicUrl,
              display_order: startOrder + i,
            });
        } catch (imgErr) {
          console.error(`Exception uploading photo ${i}:`, imgErr.message);
        }
      }

      Alert.alert('Listing updated!', 'Your changes have been saved.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderChips = (options, selected, onSelect) => (
    <View style={styles.chipRow}>
      {options.map((option) => (
        <TouchableOpacity
          key={option}
          style={[styles.chip, selected === option && styles.chipSelected]}
          onPress={() => onSelect(option)}
          activeOpacity={0.7}
        >
          <Text style={[styles.chipText, selected === option && styles.chipTextSelected]}>
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={28} color={t.textWhite} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Edit Listing</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Photos Section */}
        <Text style={styles.sectionHeader}>Photos</Text>
        <Text style={styles.sectionHint}>{totalPhotos}/{MAX_PHOTOS} added</Text>
        <View style={styles.photoGrid}>
          {existingPhotos.map((img, index) => (
            <View key={`existing-${img.id}`} style={styles.photoWrapper}>
              <Image source={{ uri: img.image_url }} style={styles.photoThumb} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => removeExistingPhoto(img.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={22} color={t.coral} />
              </TouchableOpacity>
              {index === 0 && newPhotos.length === 0 && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>Cover</Text>
                </View>
              )}
            </View>
          ))}
          {newPhotos.map((uri, index) => (
            <View key={`new-${index}`} style={styles.photoWrapper}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => removeNewPhoto(index)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={22} color={t.coral} />
              </TouchableOpacity>
              {index === 0 && existingPhotos.length === 0 && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>Cover</Text>
                </View>
              )}
            </View>
          ))}
          {totalPhotos < MAX_PHOTOS && (
            <TouchableOpacity
              style={styles.addPhotoButton}
              onPress={handleAddPhoto}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={36} color={t.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Item Details */}
        <Text style={styles.sectionHeader}>Item Details</Text>

        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Vintage Levi's 501 Jeans"
          placeholderTextColor={t.textTertiary}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Brand</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Nike, Zara, Vintage..."
          placeholderTextColor={t.textTertiary}
          value={brand}
          onChangeText={setBrand}
        />

        <Text style={styles.label}>Category *</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowCategoryModal(true)}
          activeOpacity={0.7}
        >
          <Text style={category ? styles.dropdownTextSelected : styles.dropdownTextPlaceholder}>
            {category || 'Select a category'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={t.textTertiary} />
        </TouchableOpacity>

        <Modal
          visible={showCategoryModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCategoryModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowCategoryModal(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select Category</Text>
              <FlatList
                data={CATEGORIES}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.modalOption, category === item && styles.modalOptionSelected]}
                    onPress={() => {
                      handleCategoryChange(item);
                      setShowCategoryModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalOptionText, category === item && styles.modalOptionTextSelected]}>
                      {item}
                    </Text>
                    {category === item && <Ionicons name="checkmark" size={20} color={t.coral} />}
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        <Text style={styles.label}>Vibe / Occasion</Text>
        <Text style={styles.sectionHint}>Select all that apply</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowVibeModal(true)}
          activeOpacity={0.7}
        >
          <Text style={tags.length > 0 ? styles.dropdownTextSelected : styles.dropdownTextPlaceholder}>
            {tags.length > 0 ? tags.join(', ') : 'Select vibes'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={t.textTertiary} />
        </TouchableOpacity>

        <Modal
          visible={showVibeModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowVibeModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowVibeModal(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Select Vibes</Text>
                <TouchableOpacity onPress={() => setShowVibeModal(false)}>
                  <Text style={styles.modalDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={VIBE_TAGS}
                keyExtractor={(item) => item}
                renderItem={({ item }) => {
                  const isSelected = tags.includes(item);
                  return (
                    <TouchableOpacity
                      style={[styles.modalOption, isSelected && styles.modalOptionSelected]}
                      onPress={() => toggleTag(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextSelected]}>
                        {item}
                      </Text>
                      {isSelected && <Ionicons name="checkmark" size={20} color={t.coral} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        <Text style={styles.label}>Size *</Text>
        <View style={styles.genderToggle}>
          {SIZE_GENDERS.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genderOption, sizeGender === g && styles.genderOptionActive]}
              onPress={() => handleGenderChange(g)}
              activeOpacity={0.7}
            >
              <Text style={[styles.genderOptionText, sizeGender === g && styles.genderOptionTextActive]}>
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowSizeModal(true)}
          activeOpacity={0.7}
        >
          <Text style={size ? styles.dropdownTextSelected : styles.dropdownTextPlaceholder}>
            {size || 'Select a size'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={t.textTertiary} />
        </TouchableOpacity>

        <Modal
          visible={showSizeModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowSizeModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowSizeModal(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select Size</Text>
              <FlatList
                data={currentSizes}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.modalOption, size === item && styles.modalOptionSelected]}
                    onPress={() => {
                      setSize(item);
                      setShowSizeModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalOptionText, size === item && styles.modalOptionTextSelected]}>
                      {item}
                    </Text>
                    {size === item && <Ionicons name="checkmark" size={20} color={t.coral} />}
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        <Text style={styles.label}>Condition *</Text>
        {renderChips(CONDITIONS, condition, setCondition)}

        <Text style={styles.label}>Color</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Black, Navy Blue..."
          placeholderTextColor={t.textTertiary}
          value={color}
          onChangeText={setColor}
        />

        <Text style={styles.label}>Estimated Value</Text>
        <View style={styles.valueInputWrapper}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.valueInput}
            placeholder="0"
            placeholderTextColor={t.textTertiary}
            keyboardType="numeric"
            value={estimatedValue}
            onChangeText={setEstimatedValue}
          />
        </View>

        {/* Preferences */}
        <Text style={styles.sectionHeader}>Preferences</Text>

        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.toggleText}>Open to swap + cash</Text>
            <Text style={styles.toggleHint}>Accept partial cash offers alongside swaps</Text>
          </View>
          <Switch
            value={openToSwapCash}
            onValueChange={setOpenToSwapCash}
            trackColor={{ false: '#2a2a2a', true: '#FF6B6B80' }}
            thumbColor={openToSwapCash ? '#FF6B6B' : '#555'}
          />
        </View>

        {/* Description */}
        <Text style={styles.sectionHeader}>Additional Details</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Anything else buyers should know — measurements, styling tips, flaws..."
          placeholderTextColor={t.textTertiary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.postButton, isSaving && styles.postButtonDisabled]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={t.textWhite} />
          ) : (
            <Text style={styles.postButtonText}>Save Changes</Text>
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
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: t.text,
  },

  // Section headers
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: t.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 28,
    marginBottom: 12,
  },
  sectionHint: {
    fontSize: 13,
    color: t.textTertiary,
    marginTop: -8,
    marginBottom: 12,
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

  // Value input with dollar sign
  valueInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.separator,
    paddingHorizontal: 16,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: '600',
    color: t.textTertiary,
    marginRight: 4,
  },
  valueInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: t.text,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: t.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: t.separator,
  },
  chipSelected: {
    backgroundColor: '#FF6B6B20',
    borderColor: '#FF6B6B',
  },
  chipText: {
    fontSize: 14,
    color: t.textTertiary,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#FF6B6B',
    fontWeight: '600',
  },

  // Photo grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: t.overlay,
    borderRadius: 11,
  },
  coverBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF6B6BCC',
    paddingVertical: 3,
    alignItems: 'center',
  },
  coverBadgeText: {
    color: t.text,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addPhotoButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.separator,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.card,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: t.separator,
  },
  toggleLabel: {
    flex: 1,
    marginRight: 12,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: t.text,
  },
  toggleHint: {
    fontSize: 12,
    color: t.textTertiary,
    marginTop: 2,
  },

  // Gender toggle
  genderToggle: {
    flexDirection: 'row',
    backgroundColor: t.card,
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: t.separator,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  genderOptionActive: {
    backgroundColor: '#FF6B6B',
  },
  genderOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: t.textTertiary,
  },
  genderOptionTextActive: {
    color: t.text,
  },

  // Dropdown
  dropdownButton: {
    backgroundColor: t.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: t.separator,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownTextSelected: {
    fontSize: 16,
    color: t.text,
  },
  dropdownTextPlaceholder: {
    fontSize: 16,
    color: t.textTertiary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: t.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '50%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#555',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: t.text,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalOptionSelected: {
    backgroundColor: '#FF6B6B15',
  },
  modalOptionText: {
    fontSize: 16,
    color: t.textSecondary,
  },
  modalOptionTextSelected: {
    color: '#FF6B6B',
    fontWeight: '600',
  },

  // Save button
  postButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 32,
  },
  postButtonDisabled: {
    opacity: 0.6,
  },
  postButtonText: {
    color: t.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
