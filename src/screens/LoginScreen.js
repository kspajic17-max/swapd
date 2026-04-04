import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { t } from '../app/theme';
import { supabase } from '../lib/supabase';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { alert('Please fill in all fields.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    });
    setLoading(false);
    if (error) alert('Login failed: ' + error.message);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />
      <View style={styles.inner}>
        <Text style={styles.brand}>swapd</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={t.textTertiary}
          keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={t.textTertiary}
          secureTextEntry value={password} onChangeText={setPassword} />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
          {loading
            ? <ActivityIndicator color={t.textWhite} />
            : <Text style={styles.buttonText}>Log In</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.linkContainer}>
          <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkAccent}>Sign up</Text></Text>
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
  button: { backgroundColor: t.coral, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  buttonText: { color: t.textWhite, fontSize: 17, fontWeight: '700' },
  linkContainer: { marginTop: 24, alignItems: 'center' },
  linkText: { color: t.textTertiary, fontSize: 14 },
  linkAccent: { color: t.coral, fontWeight: '600' },
});
