import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, View, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';
import { t } from '../app/theme';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import SwapOfferScreen from '../screens/SwapOfferScreen';
import SwapInboxScreen from '../screens/SwapInboxScreen';
import CounterOfferScreen from '../screens/CounterOfferScreen';
import SwapChatScreen from '../screens/SwapChatScreen';
import ShippingScreen from '../screens/ShippingScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import UserClosetScreen from '../screens/UserClosetScreen';
import EditListingScreen from '../screens/EditListingScreen';
import AdminScreen from '../screens/AdminScreen';

const AuthStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const SwapsStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const ActivityStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeScreen" component={HomeScreen} />
      <HomeStack.Screen name="ListingDetail" component={ListingDetailScreen} />
      <HomeStack.Screen name="SwapOffer" component={SwapOfferScreen} />
      <HomeStack.Screen name="UserCloset" component={UserClosetScreen} />
      <HomeStack.Screen name="EditListing" component={EditListingScreen} />
    </HomeStack.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    </AuthStack.Navigator>
  );
}

function SwapsStackNavigator() {
  return (
    <SwapsStack.Navigator screenOptions={{ headerShown: false }}>
      <SwapsStack.Screen name="SwapInbox" component={SwapInboxScreen} />
      <SwapsStack.Screen name="CounterOffer" component={CounterOfferScreen} />
      <SwapsStack.Screen name="SwapChat" component={SwapChatScreen} />
      <SwapsStack.Screen name="Shipping" component={ShippingScreen} />
      <SwapsStack.Screen name="UserCloset" component={UserClosetScreen} />
    </SwapsStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileScreen" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="EditListing" component={EditListingScreen} />
      <ProfileStack.Screen name="AdminScreen" component={AdminScreen} />
      <ProfileStack.Screen name="UserCloset" component={UserClosetScreen} />
    </ProfileStack.Navigator>
  );
}

function ActivityStackNavigator() {
  return (
    <ActivityStack.Navigator screenOptions={{ headerShown: false }}>
      <ActivityStack.Screen name="ActivityScreen" component={NotificationsScreen} />
    </ActivityStack.Navigator>
  );
}

function MainTabs({ initialTab = 'Home' }) {
  const [badgeCount, setBadgeCount] = useState(0);

  useEffect(() => {
    fetchBadgeCount();
    const interval = setInterval(fetchBadgeCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchBadgeCount = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      const uid = sessionData.session.user.id;
      const { data: myListings } = await supabase
        .from('listings').select('id').eq('user_id', uid);
      if (!myListings || myListings.length === 0) { setBadgeCount(0); return; }
      const { count } = await supabase
        .from('swap_interests').select('id', { count: 'exact', head: true })
        .in('listing_id', myListings.map((l) => l.id)).eq('status', 'pending');
      setBadgeCount(count || 0);
    } catch (err) {}
  };

  return (
    <Tab.Navigator
      initialRouteName={initialTab}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.coral,
        tabBarInactiveTintColor: t.textTertiary,
        tabBarStyle: {
          backgroundColor: t.background,
          borderTopColor: t.separator,
          borderTopWidth: 1,
          paddingBottom: 6,
          paddingTop: 6,
          height: 80,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'Activity') iconName = 'notifications-outline';
          else if (route.name === 'CreateListing') iconName = 'add-circle-outline';
          else if (route.name === 'Swaps') iconName = 'chatbubbles-outline';
          else if (route.name === 'Profile') iconName = 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} options={{ tabBarLabel: 'Browse' }} />
      <Tab.Screen
        name="Activity"
        component={ActivityStackNavigator}
        options={{
          tabBarLabel: 'Activity',
          tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: t.coral, fontSize: 10, fontWeight: '700',
            minWidth: 18, height: 18, lineHeight: 18,
          },
        }}
      />
      <Tab.Screen
        name="CreateListing"
        component={CreateListingScreen}
        initialParams={{ showFirstItemToast: initialTab === 'CreateListing' }}
        options={{ tabBarLabel: 'List' }}
      />
      <Tab.Screen name="Swaps" component={SwapsStackNavigator} options={{ tabBarLabel: 'Swaps' }} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} options={{ tabBarLabel: 'Closet' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(null);
  const [justFinishedOnboarding, setJustFinishedOnboarding] = useState(false);
  const navigationRef = useRef(null);
  const notificationResponseRef = useRef(null);

  const fetchOnboardingStatus = async (userId) => {
    try {
      const { data, error } = await supabase.from('profiles')
        .select('onboarding_complete').eq('id', userId).single();
      setOnboardingDone(error || !data ? false : data.onboarding_complete === true);
    } catch { setOnboardingDone(false); }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchOnboardingStatus(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchOnboardingStatus(session.user.id);
      else setOnboardingDone(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session && onboardingDone !== null) setLoading(false); }, [session, onboardingDone]);
  useEffect(() => { if (session) registerForPushNotifications(); }, [session]);

  useEffect(() => {
    notificationResponseRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      if (navigationRef.current) navigationRef.current.navigate('Swaps');
    });
    return () => { if (notificationResponseRef.current) Notifications.removeNotificationSubscription(notificationResponseRef.current); };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.background }}>
        <ActivityIndicator size="large" color={t.coral} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />
      {session ? (
        onboardingDone ? (
          <MainTabs initialTab={justFinishedOnboarding ? 'CreateListing' : 'Home'} />
        ) : (
          <OnboardingScreen onComplete={() => { setJustFinishedOnboarding(true); setOnboardingDone(true); }} />
        )
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
