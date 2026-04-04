import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { t } from '../app/theme';
import { supabase } from '../lib/supabase';

export default function SignUpScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password || !username || !location) {
      alert('Please fill in all fields.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: username.trim(),
          location: location.trim(),
          edu_verified: email.trim().toLowerCase().endsWith('.edu'),
        },
      },
    });
    setLoading(false);
    if (error) {
      alert('Sign up failed: ' + error.message);
    } else {
      // Navigate to dedicated verify email screen
      navigation.navigate('VerifyEmail', { email: email.trim() });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />
      <View style={styles.inner}>
        <Text style={styles.brand}>swapd</Text>
        <Text style={styles.subtitle}>Create your account</Text>

        <TextInput style={styles.input} placeholder="Username" placeholderTextColor={t.textTertiary}
          autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={t.textTertiary}
          keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Text style={styles.eduHint}>Use your .edu email for a verified badge ✓</Text>
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={t.textTertiary}
          secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={styles.input} placeholder="Location (e.g. Los Angeles, CA)"
          placeholderTextColor={t.textTertiary} value={location} onChangeText={setLocation} />

        <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading} activeOpacity={0.8}>
          {loading
            ? <ActivityIndicator color={t.textWhite} />
            : <Text style={styles.buttonText}>Sign Up</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.linkContainer}>
          <Text style={styles.linkText}>Already have an account? <Text style={styles.linkAccent}>Log in</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  brand: { fontSize: 48, fontWeight: '800', color: t.text, textAlign: 'center', marginBottom: 8, letterSpacing: -1 },
  subtitle: { fontSize: 15, color: t.textSecondary, textAlign: 'center', marginBottom: 40 },
  input: {
    backgroundColor: t.inputBackground, borderRadius: 12, paddingHorizontal: 18,
    paddingVertical: 14, fontSize: 16, color: t.text, marginBottom: 14,
    borderWidth: 1, borderColor: t.separator,
  },
  eduHint: { color: t.textTertiary, fontSize: 12, marginTop: -8, marginBottom: 14, paddingHorizontal: 4 },
  button: { backgroundColor: t.coral, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  buttonText: { color: t.textWhite, fontSize: 17, fontWeight: '700' },
  linkContainer: { marginTop: 24, alignItems: 'center' },
  linkText: { color: t.textTertiary, fontSize: 14 },
  linkAccent: { color: t.coral, fontWeight: '600' },
});
