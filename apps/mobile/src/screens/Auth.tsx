import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { Button, C, Card, ErrorNote, Field, s, useTask } from "../ui";
import type { Session } from "../types";

export default function Auth({ onAuthenticated }: { onAuthenticated: (session: Session, password: string) => Promise<void> }) {
  const [mode, setMode] = useState<"welcome" | "signin" | "register">("welcome");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [form, setForm] = useState({ displayName: "", username: "", password: "", contact: "", otp: "", dateOfBirth: "", gender: "", city: "", state: "", country: "India" });
  const [challengeId, setChallengeId] = useState("");
  const [developmentCode, setDevelopmentCode] = useState("");
  const { busy, error, run } = useTask();

  function signIn() {
    void run(async () => {
      const result = await api<Session>("/auth/sign-in", { method: "POST", body: { username: login.username.trim().toLowerCase(), password: login.password } });
      await onAuthenticated(result, login.password);
    });
  }
  function requestCode() {
    void run(async () => {
      const result = await api<{ challengeId: string; developmentCode?: string }>("/auth/request-otp-dev", { method: "POST", body: { contact: form.contact.trim() } });
      setChallengeId(result.challengeId);
      setDevelopmentCode(result.developmentCode || "");
    });
  }
  function register() {
    void run(async () => {
      if (!challengeId) throw new Error("Request a code first");
      const result = await api<Session>("/auth/register", {
        method: "POST", body: {
          ...form, username: form.username.trim().toLowerCase(),
          challengeId,
          contact: form.contact.trim(),
          otp: form.otp.trim(),
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          city: form.city || undefined,
          state: form.state || undefined
        }
      });
      await onAuthenticated(result, form.password);
    });
  }
  const set = (key: keyof typeof form) => (value: string) => setForm(current => ({ ...current, [key]: value }));
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      <View style={styles.brand}><Text style={styles.monogram}>A</Text></View>
      <Text style={styles.title}>AbbasiConnect</Text>
      <Text style={styles.subtitle}>Your family. Your connections. Your community.</Text>
      {mode === "welcome" ? <Card>
        <Text style={s.heading}>A place for people who matter</Text>
        <Text style={[s.body, { marginBottom: 18 }]}>Connect your family tree, discover compatible Rishte profiles, share community updates and have private conversations.</Text>
        <Button title="Sign in" onPress={() => setMode("signin")}/>
        <View style={{ height: 10 }}/>
        <Button title="Create account" secondary onPress={() => setMode("register")}/>
      </Card> : null}
      {mode === "signin" ? <Card>
        <Text style={s.heading}>Welcome back</Text>
        <Field label="Username" autoCapitalize="none" value={login.username} onChangeText={value => setLogin(p => ({ ...p, username: value }))}/>
        <Field label="Password" secureTextEntry value={login.password} onChangeText={value => setLogin(p => ({ ...p, password: value }))}/>
        <ErrorNote error={error}/>
        <Button title={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={signIn}/>
        <View style={{ height: 10 }}/>
        <Button title="Create an account" secondary onPress={() => setMode("register")}/>
      </Card> : null}
      {mode === "register" ? <Card>
        <Text style={s.heading}>Create your account</Text>
        <Field label="Full name" value={form.displayName} onChangeText={set("displayName")}/>
        <Field label="Username" autoCapitalize="none" value={form.username} onChangeText={set("username")} placeholder="letters, numbers and underscores"/>
        <Field label="Email or phone (+country code)" autoCapitalize="none" value={form.contact} onChangeText={value => { set("contact")(value); setChallengeId(""); setDevelopmentCode(""); }} keyboardType="email-address"/>
        <Field label="Password (8+ characters)" secureTextEntry value={form.password} onChangeText={set("password")}/>
        <Field label="Date of birth (YYYY-MM-DD, optional)" value={form.dateOfBirth} onChangeText={set("dateOfBirth")}/>
        <Field label="Gender (optional)" value={form.gender} onChangeText={set("gender")}/>
        <Field label="City (optional)" value={form.city} onChangeText={set("city")}/>
        <Field label="State (optional)" value={form.state} onChangeText={set("state")}/>
        <Field label="Country" value={form.country} onChangeText={set("country")}/>
        <Button secondary title={busy ? "Requesting…" : "Request verification code"} disabled={busy || !form.contact.trim()} onPress={requestCode}/>
        {challengeId ? <View style={{ marginTop: 12 }}>
          <Text style={s.subtle}>The current backend runs development OTP verification. It returns the code here rather than delivering it by SMS or email.</Text>
          {developmentCode ? <Text selectable style={{ color: C.teal, fontWeight: "800", fontSize: 22, marginVertical: 10 }}>{developmentCode}</Text> : null}
          <Field label="Six-digit code" keyboardType="number-pad" value={form.otp} onChangeText={set("otp")}/>
          <Button disabled={busy || form.otp.length !== 6} title={busy ? "Creating…" : "Create account"} onPress={register}/>
        </View> : null}
        <ErrorNote error={error}/>
      </Card> : null}
      {mode !== "welcome" ? <Button secondary title="Back" onPress={() => setMode("welcome")}/> : null}
      <Text style={[s.subtle, { textAlign: "center", marginTop: 22 }]}>AbbasiConnect mobile</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  scroll: { padding: 22, flexGrow: 1, justifyContent: "center", paddingTop: 55, paddingBottom: 45 },
  brand: { width: 66, height: 66, borderRadius: 22, backgroundColor: C.navy, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  monogram: { color: "#fff", fontWeight: "800", fontSize: 41 },
  title: { fontSize: 29, fontWeight: "800", color: C.navy, textAlign: "center" },
  subtitle: { textAlign: "center", color: C.muted, fontSize: 14, marginBottom: 30, marginTop: 7 }
});
