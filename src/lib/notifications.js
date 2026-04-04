import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Register for push notifications.
 * Requests permission, gets the Expo push token, and saves it to the user's profile.
 */
export async function registerForPushNotifications() {
  try {
    // Must be a physical device for push notifications
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device.');
      return null;
    }

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B6B',
      });
    }

    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted.');
      return null;
    }

    // Get the Expo push token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const pushToken = tokenData.data;

    // Save push token to the user's profile
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      const userId = sessionData.session.user.id;
      await supabase
        .from('profiles')
        .update({ push_token: pushToken })
        .eq('id', userId);
    }

    return pushToken;
  } catch (error) {
    console.warn('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Send a push notification via the Expo push notification service.
 * @param {string} recipientPushToken - The recipient's Expo push token
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional data payload (e.g. { screen: 'SwapInbox' })
 */
export async function sendPushNotification(recipientPushToken, title, body, data = {}) {
  if (!recipientPushToken) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipientPushToken,
        title,
        body,
        data,
        sound: 'default',
      }),
    });
  } catch (error) {
    console.warn('Error sending push notification:', error);
  }
}

/**
 * Schedule a local notification (useful for testing or local reminders).
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {number} seconds - Delay in seconds before showing (default 1)
 * @param {object} data - Optional data payload
 */
export async function scheduleLocalNotification(title, body, seconds = 1, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
      },
      trigger: {
        type: 'timeInterval',
        seconds,
      },
    });
  } catch (error) {
    console.warn('Error scheduling local notification:', error);
  }
}

/**
 * Helper to fetch a user's push token from their profile.
 * @param {string} userId - The user's profile id
 * @returns {string|null} The push token or null
 */
export async function getUserPushToken(userId) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();
    return data?.push_token || null;
  } catch (error) {
    console.warn('Error fetching push token:', error);
    return null;
  }
}
