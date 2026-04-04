import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../app/theme';

export default function VerifyEmailScreen({ route, navigation }) {
  const email = route.params?.email || 'your email';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={t.background} />
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Ionicons name="mail-outline" size={56} color={t.coral} />
        </View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to{'\n'}
          <Text style={styles.emailText}>{email}</Text>
        </Text>
        <Text style={styles.infoText}>
          Tap the link in the email to verify your account, then come back here and log in.
        </Text>

        <View style={styles.resendSection}>
          <Text style={styles.resendText}>Didn't get it?</Text>
          <TouchableOpacity onPress={() => alert('Resend email functionality coming soon!')}>
            <Text style={styles.resendLink}>Resend email</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color={t.text} />
          <Text style={styles.backText}>Back to log in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: t.coralTint10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 32,
  },
  title: { fontSize: 28, fontWeight: '800', color: t.text, marginBottom: 16, textAlign: 'center' },
  subtitle: { fontSize: 15, color: t.textSecondary, textAlign: 'center', marginBottom: 8, lineHeight: 22 },
  emailText: { color: t.coral, fontWeight: '600' },
  infoText: { fontSize: 13, color: t.textTertiary, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  resendSection: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  resendText: { fontSize: 14, color: t.textTertiary },
  resendLink: { fontSize: 14, color: t.coral, fontWeight: '600' },
  divider: { width: 80, height: 1, backgroundColor: t.separator, marginBottom: 28 },
  backButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: t.separator,
  },
  backText: { fontSize: 15, fontWeight: '600', color: t.text },
});
