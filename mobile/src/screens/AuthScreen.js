import React, { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C } from '../theme';
import { Button, Field, Chips, Footer } from '../components/ui';

const GENDERS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not', label: 'Prefer not to say' }];

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | reset
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [f, setF] = useState({ id: '', password: '', confirm: '', fullName: '', mobile: '', email: '', otp: '', dob: '', gender: undefined, city: '', emergencyName: '', emergencyMobile: '', consent: false });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { Alert.alert('Check the details', e.message); } finally { setBusy(false); } };

  const login = () => run(async () => {
    const r = await api('/auth/login', { method: 'POST', auth: false, body: { id: f.id, password: f.password } });
    await signIn(r.token, r.user);
  });

  const sendOtp = (purpose) => run(async () => {
    const r = await api('/auth/otp', { method: 'POST', auth: false, body: { mobile: f.mobile, purpose } });
    setOtpSent(true);
    Alert.alert('Code sent', r.devCode ? `Test mode code: ${r.devCode}` : `We sent a 6-digit code to ${f.mobile}.`);
  });

  const register = () => run(async () => {
    if (f.password !== f.confirm) throw new Error('Passwords do not match');
    if (!f.consent) throw new Error('Accept the privacy terms to continue');
    const r = await api('/auth/register', { method: 'POST', auth: false, body: {
      fullName: f.fullName, mobile: f.mobile, email: f.email, password: f.password, otp: f.otp,
      dob: f.dob, gender: f.gender, city: f.city, emergencyName: f.emergencyName, emergencyMobile: f.emergencyMobile, consent: true,
    } });
    await signIn(r.token, r.user);
  });

  const reset = () => run(async () => {
    if (f.password !== f.confirm) throw new Error('Passwords do not match');
    await api('/auth/reset', { method: 'POST', auth: false, body: { mobile: f.mobile, otp: f.otp, password: f.password } });
    Alert.alert('Password updated', 'Sign in with your new password.');
    setMode('login'); setOtpSent(false);
  });

  const switchTo = (m) => { setMode(m); setOtpSent(false); };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Text style={st.brand}>Saathi</Text>
        <Text style={st.tag}>Share where you are with the people you trust. Get help with one hold.</Text>

        <View style={st.tabs}>
          {[['login', 'Sign in'], ['register', 'Create account']].map(([k, l]) => (
            <Pressable key={k} onPress={() => switchTo(k)} style={[st.tab, mode === k && st.tabOn]}>
              <Text style={[st.tabText, mode === k && { color: C.ink }]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'login' && (
          <>
            <Field label="Mobile number or email" value={f.id} onChangeText={set('id')} autoCapitalize="none" keyboardType="email-address" placeholder="98765 43210" />
            <Field label="Password" value={f.password} onChangeText={set('password')} secureTextEntry />
            <Button title="Sign in" onPress={login} loading={busy} />
            <Pressable onPress={() => switchTo('reset')}><Text style={st.link}>Forgot password?</Text></Pressable>
          </>
        )}

        {mode === 'register' && (
          <>
            <Text style={st.section}>Your details</Text>
            <Field label="Full name *" value={f.fullName} onChangeText={set('fullName')} placeholder="As you want others to see it" />
            <Field label="Mobile number *" value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" placeholder="98765 43210" hint="Your mobile number is your Saathi ID. People find you by it." editable={!otpSent} />
            {!otpSent ? (
              <Button title="Send verification code" variant="outline" onPress={() => sendOtp('register')} loading={busy} style={{ marginBottom: 14 }} />
            ) : (
              <Field label="Verification code *" value={f.otp} onChangeText={set('otp')} keyboardType="number-pad" maxLength={6} placeholder="6-digit code" />
            )}
            <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" hint="Optional. People can also find you by email." />
            <Field label="Date of birth" value={f.dob} onChangeText={set('dob')} placeholder="YYYY-MM-DD" />
            <Text style={st.label}>Gender</Text>
            <Chips options={GENDERS} value={f.gender} onChange={set('gender')} />
            <Field label="City" value={f.city} onChangeText={set('city')} placeholder="Pune" />

            <Text style={st.section}>Emergency contact</Text>
            <Text style={st.note}>Gets your SOS alerts if they use Saathi.</Text>
            <Field label="Name" value={f.emergencyName} onChangeText={set('emergencyName')} />
            <Field label="Mobile number" value={f.emergencyMobile} onChangeText={set('emergencyMobile')} keyboardType="phone-pad" />

            <Text style={st.section}>Security</Text>
            <Field label="Password *" value={f.password} onChangeText={set('password')} secureTextEntry hint="At least 8 characters" />
            <Field label="Confirm password *" value={f.confirm} onChangeText={set('confirm')} secureTextEntry />

            <Pressable onPress={() => set('consent')(!f.consent)} style={st.consent}>
              <View style={[st.box, f.consent && { backgroundColor: C.teal, borderColor: C.teal }]}>{f.consent && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}</View>
              <Text style={st.consentText}>I understand my location is shared only with people I approve, only for the time I choose, and I can stop at any time.</Text>
            </Pressable>
            <Button title="Create account" onPress={register} loading={busy} disabled={!otpSent} />
          </>
        )}

        {mode === 'reset' && (
          <>
            <Text style={st.section}>Reset password</Text>
            <Field label="Registered mobile number" value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" editable={!otpSent} />
            {!otpSent ? <Button title="Send code" onPress={() => sendOtp('reset')} loading={busy} /> : (
              <>
                <Field label="Verification code" value={f.otp} onChangeText={set('otp')} keyboardType="number-pad" maxLength={6} />
                <Field label="New password" value={f.password} onChangeText={set('password')} secureTextEntry />
                <Field label="Confirm new password" value={f.confirm} onChangeText={set('confirm')} secureTextEntry />
                <Button title="Update password" onPress={reset} loading={busy} />
              </>
            )}
            <Pressable onPress={() => switchTo('login')}><Text style={st.link}>Back to sign in</Text></Pressable>
          </>
        )}
        <Footer />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 22, paddingTop: 70, backgroundColor: C.paper, flexGrow: 1 },
  brand: { fontSize: 40, fontWeight: '900', color: C.teal, letterSpacing: -1 },
  tag: { fontSize: 16, color: C.slate, marginTop: 6, marginBottom: 26, lineHeight: 22 },
  tabs: { flexDirection: 'row', backgroundColor: '#E5EBE8', borderRadius: 12, padding: 4, marginBottom: 22 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  tabOn: { backgroundColor: '#fff' },
  tabText: { fontWeight: '700', color: C.slate },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 8, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: C.slate, marginBottom: 6 },
  note: { color: C.slate, marginTop: -6, marginBottom: 10 },
  link: { color: C.teal, fontWeight: '700', textAlign: 'center', marginTop: 16 },
  consent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginVertical: 14 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  consentText: { flex: 1, color: C.ink, lineHeight: 20 },
});
