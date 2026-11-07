import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import { mediaData } from "./api";
import type { Member } from "./types";

export const C = { navy: "#143644", teal: "#197c75", mint: "#e4f4ef", ink: "#203342", muted: "#6c7c86", border: "#dce7e7", bg: "#f5f8f7", white: "#ffffff", red: "#bd3f46", gold: "#c39861" };
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 18, paddingBottom: 32 },
  card: { backgroundColor: C.white, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  title: { fontSize: 25, fontWeight: "800", color: C.navy, letterSpacing: -0.6 },
  heading: { fontSize: 18, fontWeight: "700", color: C.navy, marginBottom: 9 },
  body: { color: C.ink, fontSize: 15, lineHeight: 22 },
  subtle: { color: C.muted, fontSize: 13, lineHeight: 19 },
  label: { fontSize: 13, color: C.navy, fontWeight: "700", marginBottom: 6 },
  input: { borderColor: C.border, borderWidth: 1, borderRadius: 12, backgroundColor: C.white, color: C.ink, paddingHorizontal: 14, paddingVertical: 12, minHeight: 46, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center" },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, backgroundColor: C.teal, alignItems: "center", justifyContent: "center", minHeight: 46 },
  btnSecondary: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 17, borderColor: C.border, borderWidth: 1, backgroundColor: C.white, alignItems: "center", justifyContent: "center", minHeight: 44 },
  btnText: { color: C.white, fontSize: 15, fontWeight: "700" },
  btnSecondaryText: { color: C.teal, fontSize: 14, fontWeight: "700" },
  divider: { borderBottomColor: C.border, borderBottomWidth: 1, marginVertical: 12 },
  error: { color: C.red, marginVertical: 10, fontSize: 13 },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: C.mint, alignSelf: "flex-start" },
  chipText: { color: C.teal, fontSize: 12, fontWeight: "700" }
});

export function Button({ title, onPress, secondary, danger, disabled, small }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean; small?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[secondary ? s.btnSecondary : s.btn, small && { minHeight: 35, paddingVertical: 7, paddingHorizontal: 10 }, disabled && { opacity: .5 }, danger && { backgroundColor: C.red }]}>
    <Text style={secondary ? s.btnSecondaryText : s.btnText}>{title}</Text>
  </Pressable>;
}
export function Field({ label, value, onChangeText, placeholder, secureTextEntry, multiline, keyboardType, autoCapitalize, editable = true, ...rest }: {
 label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; secureTextEntry?: boolean; multiline?: boolean; keyboardType?: KeyboardTypeOptions; autoCapitalize?: TextInputProps["autoCapitalize"]; editable?: boolean;
} & Omit<TextInputProps, "value" | "onChangeText">) {
  return <View style={{ marginBottom: 13 }}><Text style={s.label}>{label}</Text><TextInput style={[s.input, multiline && { minHeight: 104, textAlignVertical: "top" }]} accessibilityLabel={label} placeholder={placeholder} placeholderTextColor="#97a5aa" value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} multiline={multiline} keyboardType={keyboardType} autoCapitalize={autoCapitalize} editable={editable} {...rest}/></View>;
}
export function Card({ children }: { children: React.ReactNode }) { return <View style={s.card}>{children}</View>; }
export function Title({ title, caption }: { title: string; caption?: string }) { return <View style={{ marginBottom: 18 }}><Text style={s.title}>{title}</Text>{caption ? <Text style={[s.subtle, { marginTop: 5 }]}>{caption}</Text> : null}</View>; }
export function Chip({ label }: { label: string }) { return <View style={s.chip}><Text style={s.chipText}>{label}</Text></View>; }
export function ErrorNote({ error }: { error?: string | null }) { return error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null; }
export function Empty({ text }: { text: string }) { return <Card><Text style={[s.subtle, { textAlign: "center", paddingVertical: 14 }]}>{text}</Text></Card>; }
export function Loading() { return <View style={{ padding: 35, alignItems: "center" }}><ActivityIndicator color={C.teal}/></View>; }
export function Page({ children, refresh, refreshing }: { children: React.ReactNode; refresh?: () => void; refreshing?: boolean }) {
  // ScrollView is used for consistent keyboard handling; RefreshControl is optional.
  return <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled" refreshControl={refresh ? <RefreshControl refreshing={!!refreshing} onRefresh={refresh} colors={[C.teal]}/> : undefined}>{children}</ScrollView>;
}
const photoCache = new Map<string, string | null>();
export function invalidatePhoto(id: string) { photoCache.delete("profile:" + id); }
export function Avatar({ member, size = 44 }: { member: Pick<Member, "id" | "displayName">; size?: number }) {
  const key = "profile:" + member.id;
  const [uri, setUri] = useState<string | null>(photoCache.get(key) || null);
  useEffect(() => {
    let active = true;
    if (photoCache.has(key)) { setUri(photoCache.get(key) || null); return; }
    void mediaData("/media/profile/" + encodeURIComponent(member.id))
      .then(v => { if (active) { photoCache.set(key, v); setUri(v); } })
      .catch(() => { if (active) { photoCache.set(key, null); setUri(null); } });
    return () => { active = false; };
  }, [key]);
  const initials = member.displayName.trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.mint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
    {uri ? <Image source={{ uri }} style={{ width: size, height: size }}/>:<Text style={{ color: C.teal, fontSize: size * .35, fontWeight: "700" }}>{initials || "A"}</Text>}
  </View>;
}
export function MemberRow({ member, action }: { member: Member; action?: React.ReactNode }) {
  return <View style={[s.row, { paddingVertical: 8, gap: 11 }]}>
    <Avatar member={member}/>
    <View style={{ flex: 1 }}><Text style={{ color: C.navy, fontWeight: "700", fontSize: 15 }}>{member.displayName}</Text><Text style={s.subtle}>{"@" + member.username + (member.city ? " · " + member.city : "")}</Text>{member.occupation ? <Text style={s.subtle}>{member.occupation}</Text> : null}</View>
    {action}
  </View>;
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(operation: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }
  return { busy, error, setError, run };
}
