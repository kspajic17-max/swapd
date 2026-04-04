import React, { useState, useEffect, useRef, useCallback } import { t } from '../app/theme';
import 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { sendPushNotification, getUserPushToken } from '../lib/notifications';

export default function SwapChatScreen({ navigation, route }) {
  const { interestId, otherUser } = route.params;

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [offerSummary, setOfferSummary] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Start polling when focused
      pollRef.current = setInterval(() => {
        fetchMessages();
      }, 5000);

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [userId])
  );

  const init = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;
      const uid = sessionData.session.user.id;
      setUserId(uid);

      await Promise.all([fetchMessages(), fetchOfferSummary()]);
    } catch (err) {
      console.warn('Error initializing chat:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(username, display_name, avatar_url)')
      .eq('interest_id', interestId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const fetchOfferSummary = async () => {
    try {
      // Get the latest offer for this interest
      const { data: offers } = await supabase
        .from('swap_offers')
        .select('*')
        .eq('interest_id', interestId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!offers || offers.length === 0) return;
      const offer = offers[0];

      // Get the interest + listing info
      const { data: interest } = await supabase
        .from('swap_interests')
        .select(`
          *,
          listing:listings(id, title, brand, size)
        `)
        .eq('id', interestId)
        .single();

      // Get offered listing titles
      let offeredTitles = [];
      if (offer.offered_listing_ids && offer.offered_listing_ids.length > 0) {
        const { data: offeredListings } = await supabase
          .from('listings')
          .select('title')
          .in('id', offer.offered_listing_ids);
        offeredTitles = (offeredListings || []).map((l) => l.title);
      }

      setOfferSummary({
        status: offer.status,
        cashAddition: offer.cash_addition,
        targetTitle: interest?.listing?.title || 'Unknown item',
        offeredTitles,
      });
    } catch (err) {
      console.warn('Error fetching offer summary:', err.message);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const { error } = await supabase.from('messages').insert({
        interest_id: interestId,
        sender_id: sessionData.session.user.id,
        content: text,
      });

      if (error) throw error;

      // Send push notification to the other user
      try {
        // Determine the other user's ID from the interest
        const { data: interest } = await supabase
          .from('swap_interests')
          .select('interested_user_id, listing:listings(user_id)')
          .eq('id', interestId)
          .single();

        if (interest) {
          const myId = sessionData.session.user.id;
          const otherUserId =
            interest.interested_user_id === myId
              ? interest.listing?.user_id
              : interest.interested_user_id;

          if (otherUserId) {
            const recipientToken = await getUserPushToken(otherUserId);
            if (recipientToken) {
              const { data: myProfile } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', myId)
                .single();
              const myUsername = myProfile?.username || 'Someone';
              const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
              await sendPushNotification(
                recipientToken,
                `New message from @${myUsername}`,
                preview,
                { screen: 'SwapInbox' }
              );
            }
          }
        }
      } catch (notifErr) {
        console.warn('Notification error:', notifErr);
      }

      await fetchMessages();
    } catch (err) {
      console.warn('Error sending message:', err.message);
      setInputText(text); // Restore text on failure
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return '#4CAF50';
      case 'declined': return '#EF5350';
      case 'countered': return '#FFA726';
      default: return '#888';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'accepted': return 'Accepted';
      case 'declined': return 'Declined';
      case 'countered': return 'Countered';
      default: return 'Pending';
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const hours = date.getHours();
    const mins = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${mins} ${ampm}`;
  };

  const renderMessage = ({ item }) => {
    const isMe = item.sender_id === userId;
    const senderName =
      item.sender?.display_name || item.sender?.username || 'User';

    return (
      <View
        style={[
          styles.messageBubbleRow,
          isMe ? styles.messageBubbleRowRight : styles.messageBubbleRowLeft,
        ]}
      >
        {!isMe && (
          <View style={styles.msgAvatarWrap}>
            {item.sender?.avatar_url ? (
              <Image
                source={{ uri: item.sender.avatar_url }}
                style={styles.msgAvatar}
              />
            ) : (
              <View style={[styles.msgAvatar, styles.msgAvatarPlaceholder]}>
                <Text style={styles.msgAvatarText}>
                  {(senderName[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isMe ? styles.messageBubbleMe : styles.messageBubbleThem,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMe ? styles.messageTextMe : styles.messageTextThem,
            ]}
          >
            {item.content}
          </Text>
          <Text style={styles.messageTime}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  const renderOfferCard = () => {
    if (!offerSummary) return null;

    return (
      <View style={styles.offerCard}>
        <View style={styles.offerCardHeader}>
          <Ionicons name="swap-horizontal" size={16} color={t.coral} />
          <Text style={styles.offerCardTitle}>Swap Status</Text>
          <View
            style={[
              styles.offerStatusBadge,
              { borderColor: getStatusColor(offerSummary.status) },
            ]}
          >
            <View
              style={[
                styles.offerStatusDot,
                { backgroundColor: getStatusColor(offerSummary.status) },
              ]}
            />
            <Text
              style={[
                styles.offerStatusText,
                { color: getStatusColor(offerSummary.status) },
              ]}
            >
              {getStatusLabel(offerSummary.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.offerItemText} numberOfLines={1}>
          Requested: {offerSummary.targetTitle}
        </Text>
        {offerSummary.offeredTitles.length > 0 && (
          <Text style={styles.offerItemText} numberOfLines={1}>
            Offered: {offerSummary.offeredTitles.join(', ')}
          </Text>
        )}
        {offerSummary.cashAddition > 0 && (
          <Text style={styles.offerCashText}>
            + ${offerSummary.cashAddition} cash
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  const otherName =
    otherUser?.display_name || otherUser?.username || 'User';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={t.textWhite} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {otherUser?.avatar_url ? (
            <Image
              source={{ uri: otherUser.avatar_url }}
              style={styles.headerAvatar}
            />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
              <Text style={styles.headerAvatarText}>
                {(otherName[0] || '?').toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.headerTitle}>{otherName}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Offer summary card */}
      {renderOfferCard()}

      {/* Messages */}
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        contentContainerStyle={[
          styles.messageListContent,
          messages.length === 0 && styles.emptyListContent,
        ]}
        inverted={false}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color={t.textTertiary} />
            <Text style={styles.emptyChatText}>No messages yet</Text>
            <Text style={styles.emptyChatSubtext}>
              Ask a quick question about the item
            </Text>
          </View>
        }
      />

      {/* Send Offer shortcut */}
      {offerSummary?.status !== 'accepted' && (
        <TouchableOpacity
          style={styles.sendOfferBar}
          activeOpacity={0.8}
          onPress={async () => {
            // Get the listing from this interest
            const { data: interest } = await supabase
              .from('swap_interests')
              .select('*, listing:listings(*)')
              .eq('id', interestId)
              .single();
            if (interest?.listing) {
              navigation.navigate('SwapOffer', { listing: interest.listing });
            }
          }}
        >
          <Ionicons name="swap-horizontal" size={16} color={t.coral} style={{ marginRight: 6 }} />
          <Text style={styles.sendOfferBarText}>Send Offer</Text>
          <Ionicons name="chevron-forward" size={16} color={t.coral} />
        </TouchableOpacity>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Message..."
          placeholderTextColor={t.textTertiary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            (!inputText.trim() || sending) && styles.sendBtnDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          activeOpacity={0.7}
        >
          <Ionicons
            name="send"
            size={18}
            color={inputText.trim() && !sending ? '#fff' : '#555'}
          />
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
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
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  headerAvatarPlaceholder: {
    backgroundColor: '#FF6B6B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: t.text,
  },

  // Offer summary card
  offerCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: t.separator,
  },
  offerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  offerCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: t.textSecondary,
    flex: 1,
  },
  offerStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  offerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  offerStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  offerItemText: {
    fontSize: 13,
    color: t.textTertiary,
    marginBottom: 2,
  },
  offerCashText: {
    fontSize: 13,
    color: '#FF6B6B',
    fontWeight: '600',
    marginTop: 2,
  },

  // Messages
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyChat: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChatText: {
    fontSize: 15,
    fontWeight: '600',
    color: t.textTertiary,
    marginTop: 10,
  },
  emptyChatSubtext: {
    fontSize: 13,
    color: t.textTertiary,
    marginTop: 4,
  },

  messageBubbleRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-end',
  },
  messageBubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  messageBubbleRowRight: {
    justifyContent: 'flex-end',
  },
  msgAvatarWrap: {
    marginRight: 8,
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  msgAvatarPlaceholder: {
    backgroundColor: '#FF6B6B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageBubbleMe: {
    backgroundColor: '#FF6B6B',
    borderBottomRightRadius: 4,
  },
  messageBubbleThem: {
    backgroundColor: t.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: t.separator,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextMe: {
    color: t.text,
  },
  messageTextThem: {
    color: t.textSecondary,
  },
  messageTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },

  // Input bar
  sendOfferBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: t.card,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  sendOfferBarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B6B',
    flex: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 10,
    borderTopWidth: 1,
    borderTopColor: t.separator,
    backgroundColor: t.background,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: t.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: t.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: t.separator,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: t.card,
  },
});
