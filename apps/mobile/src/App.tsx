import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, StatusBar, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { api, clearToken, loadToken, saveToken } from "./api";
import { lockMessaging, prepareMessaging } from "./crypto";
import { C, ErrorNote, s } from "./ui";
import type { Member, Session, Tab } from "./types";
import Auth from "./screens/Auth";
import Home from "./screens/Home";
import Family from "./screens/Family";
import Rishte from "./screens/Rishte";
import Community from "./screens/Community";
import Messages from "./screens/Messages";
import Settings from "./screens/Settings";
import Admin from "./screens/Admin";

const tabs: { id: Tab; label: string; glyph: string }[] = [
  { id: "home", label: "Home", glyph: "⌂" },
  { id: "family", label: "Family", glyph: "♧" },
  { id: "rishte", label: "Rishte", glyph: "♡" },
  { id: "community", label: "Community", glyph: "◎" },
  { id: "messages", label: "Messages", glyph: "✉" },
  { id: "settings", label: "Account", glyph: "◯" }
];
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const existing = await loadToken();
        if (existing) {
          const data = await api<Omit<Session, "token">>("/auth/session");
          if (active) setSession({ ...data, token: existing });
        }
      } catch (e) {
        if ((e as any)?.status === 401) await clearToken().catch(() => undefined);
        else if (active) setError(e instanceof Error ? e.message : "Could not restore session");
      } finally { if (active) setChecking(false); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (session && tab !== "home") { setTab("home"); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [tab, session]);
  async function authenticated(data: Session, password: string) {
    await saveToken(data.token);
    setSession(data); setError(""); setTab("home");
    if (data.mode === "member") {
      // Signing in must succeed even if encryption provisioning is temporarily unavailable.
      void prepareMessaging(data.user.id, password).catch(() => undefined);
    }
  }
  async function logout() {
    lockMessaging();
    await clearToken();
    setSession(null); setTab("home");
  }
  function updateMember(member: Member) { setSession(existing => existing ? { ...existing, user: member } : existing); }
  const member = session?.user;
  return <SafeAreaProvider>
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content"/>
      {checking ? <View style={styles.center}><ActivityIndicator color={C.teal}/><Text style={s.subtle}>Opening AbbasiConnect…</Text></View> :
      !session ? <><Auth onAuthenticated={authenticated}/><ErrorNote error={error}/></> :
      session.mode === "admin" ? <Admin logout={() => void logout()}/> :
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={styles.topbar}><View style={styles.brandIcon}><Text style={{ color: C.white, fontWeight: "800", fontSize: 18 }}>A</Text></View><Text style={styles.brand}>AbbasiConnect</Text><Text style={styles.connected}>Community</Text></View>
        <View style={{ flex: 1 }}>
          {tab === "home" ? <Home member={member!} navigate={setTab}/> : null}
          {tab === "family" ? <Family member={member!}/> : null}
          {tab === "rishte" ? <Rishte member={member!}/> : null}
          {tab === "community" ? <Community member={member!}/> : null}
          {tab === "messages" ? <Messages member={member!}/> : null}
          {tab === "settings" ? <Settings member={member!} onUpdate={updateMember} onLogout={() => void logout()}/> : null}
        </View>
        <View style={styles.bottom}>{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} style={[styles.navItem, tab === item.id && styles.selected]}>
          <Text style={[styles.glyph, tab === item.id && { color: C.teal }]}>{item.glyph}</Text><Text numberOfLines={1} style={[styles.label, tab === item.id && { color: C.teal, fontWeight: "800" }]}>{item.label}</Text>
        </Pressable>)}</View>
      </View>}
    </SafeAreaView>
  </SafeAreaProvider>;
}
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  topbar: { paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: C.border, gap: 9, backgroundColor: C.white },
  brandIcon: { width: 29, height: 29, borderRadius: 9, backgroundColor: C.navy, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 18, fontWeight: "800", color: C.navy, letterSpacing: -.5, flex: 1 },
  connected: { color: C.muted, fontSize: 12 },
  bottom: { flexDirection: "row", backgroundColor: C.white, borderTopWidth: 1, borderColor: C.border, paddingVertical: 7, paddingHorizontal: 3 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 5, borderRadius: 11 },
  selected: { backgroundColor: C.mint },
  glyph: { fontSize: 20, color: C.muted, marginBottom: 2 },
  label: { color: C.muted, fontSize: 9, fontWeight: "600" }
});
