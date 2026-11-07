import React, { useEffect, useState } from "react";
import { Alert, Image, Switch, Text, View } from "react-native";
import { api } from "../api";
import { pickImage, uploadProfile } from "../media";
import { Avatar, Button, Card, C, ErrorNote, Field, Page, invalidatePhoto, s, Title, useTask } from "../ui";
import type { Member } from "../types";

export default function Settings({ member, onUpdate, onLogout }: { member: Member; onUpdate: (m: Member) => void; onLogout: () => void }) {
  const [values, setValues] = useState({
    displayName: member.displayName, city: member.city || "", state: member.state || "",
    country: member.country || "India", gender: member.gender || "", dateOfBirth: member.dateOfBirth || "",
    education: member.education || "", occupation: member.occupation || "", about: member.about || "",
    languages: member.languages || "", interests: member.interests || "", isDirectoryVisible: member.isDirectoryVisible ?? true
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [aadhaar, setAadhaar] = useState({ reference: "", name: "", last4: "" });
  const { busy, error, run } = useTask();
  const update = (key: keyof typeof values) => (value: string) => setValues(prev => ({ ...prev, [key]: value }));
  return <Page>
    <Title title="Your account" caption="Manage your profile, privacy, and session."/>
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 15 }}>
        <Avatar member={member} size={64}/>
        <View style={{ flex: 1 }}><Text style={s.heading}>{member.displayName}</Text><Text style={s.subtle}>{"@" + member.username}</Text></View>
      </View>
      {photo ? <Image source={{ uri: photo }} style={{ width: 84, height: 84, borderRadius: 42, marginBottom: 10 }}/> : null}
      <View style={{ flexDirection: "row", gap: 7 }}>
        <View style={{ flex: 1 }}><Button secondary small title="Choose photo" disabled={busy} onPress={() => void run(async () => setPhoto(await pickImage()))}/></View>
        <View style={{ flex: 1 }}><Button small title="Save photo" disabled={busy || !photo} onPress={() => void run(async () => { if (!photo) return; await uploadProfile(photo); invalidatePhoto(member.id); setPhoto(null); Alert.alert("Saved", "Photo updated. Refresh to see it in other screens."); })}/></View>
      </View>
      <View style={{ marginTop: 9 }}><Button small secondary title="Remove profile photo" disabled={busy} onPress={() => void run(async () => { await api("/media/profile", { method: "DELETE" }); invalidatePhoto(member.id); Alert.alert("Removed", "Your profile photo was removed."); })}/></View>
    </Card>
    <Card><Text style={s.heading}>Public profile</Text>
      <Field label="Full name" value={values.displayName} onChangeText={update("displayName")}/>
      <Field label="City" value={values.city} onChangeText={update("city")}/>
      <Field label="State" value={values.state} onChangeText={update("state")}/>
      <Field label="Country" value={values.country} onChangeText={update("country")}/>
      <Field label="Gender" value={values.gender} onChangeText={update("gender")}/>
      <Field label="Date of birth (YYYY-MM-DD)" value={values.dateOfBirth} onChangeText={update("dateOfBirth")}/>
      <Field label="Education" value={values.education} onChangeText={update("education")}/>
      <Field label="Occupation" value={values.occupation} onChangeText={update("occupation")}/>
      <Field label="About" multiline value={values.about} onChangeText={update("about")}/>
      <Field label="Languages" value={values.languages} onChangeText={update("languages")}/>
      <Field label="Interests" multiline value={values.interests} onChangeText={update("interests")}/>
      <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
        <View style={{ flex: 1 }}><Text style={s.heading}>Appear in member directory</Text><Text style={s.subtle}>Approved family-tree access remains separate.</Text></View>
        <Switch value={values.isDirectoryVisible} onValueChange={value => setValues(p => ({ ...p, isDirectoryVisible: value }))} trackColor={{ true: C.teal }}/>
      </View>
      <Button title={busy ? "Saving…" : "Save profile"} disabled={busy} onPress={() => void run(async () => {
        const updateBody = { ...values, dateOfBirth: values.dateOfBirth || undefined };
        const updated = await api<Member>("/auth/me", { method: "PATCH", body: updateBody });
        onUpdate(updated);
        Alert.alert("Saved", "Your profile has been updated.");
      })}/>
    </Card>
    <Card><Text style={s.heading}>Aadhaar development link</Text>
      <Text style={[s.subtle, { marginBottom: 10 }]}>This backend endpoint only simulates linking an identity reference; it does not verify Aadhaar with UIDAI.</Text>
      <Field label="Development identity reference" value={aadhaar.reference} onChangeText={reference => setAadhaar(v => ({ ...v, reference }))}/>
      <Field label="Name" value={aadhaar.name} onChangeText={name => setAadhaar(v => ({ ...v, name }))}/>
      <Field label="Last four digits (optional)" value={aadhaar.last4} onChangeText={last4 => setAadhaar(v => ({ ...v, last4 }))} keyboardType="numeric"/>
      <Button title="Link development reference" secondary disabled={busy || !aadhaar.reference || !aadhaar.name} onPress={() => void run(async () => {
        await api("/identity/aadhaar-dev", { method: "POST", body: { ...aadhaar, last4: aadhaar.last4 || undefined } });
        Alert.alert("Saved", "Development reference linked. This is not a production Aadhaar verification.");
      })}/>
    </Card>
    <ErrorNote error={error}/>
    <Button secondary title="Sign out" onPress={onLogout}/>
  </Page>;
}
