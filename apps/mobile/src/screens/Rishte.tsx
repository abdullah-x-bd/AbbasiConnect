import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { api } from "../api";
import { Button, Card, Chip, Empty, ErrorNote, Field, MemberRow, Page, s, Title, useTask } from "../ui";
import { useRefresh } from "../refresh";
import type { MatchInterest, Member, RishteProfile } from "../types";

const initialListing = { isActive: false, headline: "", bio: "", familyNote: "", lookingFor: "" };

export default function Rishte({ member }: { member: Member }) {
  const [section, setSection] = useState<"browse" | "mine" | "interests">("browse");
  const [query, setQuery] = useState({ q: "", city: "", gender: "" });
  const [profiles, setProfiles] = useState<RishteProfile[]>([]);
  const [listing, setListing] = useState(initialListing);
  const [incoming, setIncoming] = useState<MatchInterest[]>([]);
  const [outgoing, setOutgoing] = useState<MatchInterest[]>([]);
  const { busy, error, run } = useTask();
  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(query).filter(([,v]) => v));
    const [browse, mine, interests] = await Promise.all([
      api<{ profiles: RishteProfile[] }>("/rishte?" + qs.toString()),
      api<{ profile: typeof initialListing | null }>("/rishte/me"),
      api<{ received: MatchInterest[]; sent: MatchInterest[] }>("/rishte/interests")
    ]);
    setProfiles(browse.profiles || []);
    setListing(mine.profile ? { ...initialListing, ...mine.profile } : initialListing);
    setIncoming(interests.received || []);
    setOutgoing(interests.sent || []);
  }, [query.q, query.city, query.gender]);
  const { refresh, refreshing } = useRefresh(load, [load], 18000);
  const setQueryValue = (key: keyof typeof query) => (value: string) => setQuery(q => ({ ...q, [key]: value }));
  const setListingValue = (key: keyof typeof listing) => (value: string | boolean) => setListing(current => ({ ...current, [key]: value }));
  function sendInterest(profile: RishteProfile) {
    if (Platform.OS === "ios") Alert.prompt("Express interest", "An optional message", [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: message => void run(async () => { await api("/rishte/" + profile.id + "/interest", { method: "POST", body: { message: message || "" } }); await load(); }) }
    ]);
    // Alert.prompt is iOS-only, so Android uses a confirmation dialog.
    if (Platform.OS === "android") Alert.alert("Express interest", "Send an interest to " + profile.displayName + "?", [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: () => void run(async () => { await api("/rishte/" + profile.id + "/interest", { method: "POST", body: {} }); await load(); }) }
    ]);
  }
  function action(id: string, actionName: "ACCEPT" | "DECLINE" | "WITHDRAW") {
    void run(async () => { await api("/rishte/interests/" + id, { method: "PATCH", body: { action: actionName } }); await load(); });
  }
  return <Page refresh={refresh} refreshing={refreshing}>
    <Title title="Rishte" caption="Thoughtful connections between families."/>
    <View style={{ flexDirection: "row", gap: 7, marginBottom: 14 }}>
      {(["browse","mine","interests"] as const).map(x => <View key={x} style={{ flex: 1 }}><Button title={x === "mine" ? "My listing" : x === "browse" ? "Discover" : "Interests"} small secondary={x !== section} onPress={() => setSection(x)}/></View>)}
    </View>
    {section === "browse" ? <>
      <Card>
        <Field label="Search name, occupation or education" value={query.q} onChangeText={setQueryValue("q")}/>
        <Field label="City" value={query.city} onChangeText={setQueryValue("city")}/>
        <Field label="Gender (optional)" value={query.gender} onChangeText={setQueryValue("gender")} placeholder="Female, Male, Other"/>
      </Card>
      {!profiles.length ? <Empty text="No matching profiles currently."/> : profiles.map(profile => <Card key={profile.id}>
        <MemberRow member={profile}/>
        <View style={{ marginVertical: 8 }}><Chip label={profile.relationship?.status === "NONE" ? "Available to connect" : profile.relationship.status}/></View>
        <Text style={s.heading}>{profile.rishte?.headline}</Text>
        {profile.rishte?.bio ? <Text style={s.body}>{profile.rishte.bio}</Text> : null}
        {profile.rishte?.familyNote ? <Text style={[s.subtle, { marginTop: 8 }]}>Family: {profile.rishte.familyNote}</Text> : null}
        {profile.rishte?.lookingFor ? <Text style={[s.subtle, { marginTop: 6 }]}>Looking for: {profile.rishte.lookingFor}</Text> : null}
        <View style={{ marginTop: 12 }}><Button disabled={busy || profile.relationship?.status === "PENDING" || profile.relationship?.status === "ACCEPTED"} title={profile.relationship?.status === "PENDING" ? "Interest pending" : profile.relationship?.status === "ACCEPTED" ? "Connected" : "Express interest"} onPress={() => sendInterest(profile)}/></View>
      </Card>)}
    </> : null}
    {section === "mine" ? <Card>
      <Text style={s.heading}>Your matrimonial listing</Text>
      <Text style={[s.subtle, { marginBottom: 12 }]}>Only an active listing appears in discovery.</Text>
      <Button secondary title={listing.isActive ? "Status: Visible (tap to pause)" : "Status: Paused (tap to publish)"} onPress={() => setListingValue("isActive")(!listing.isActive)}/>
      <View style={{ height: 14 }}/>
      <Field label="Headline" value={listing.headline} onChangeText={setListingValue("headline")}/>
      <Field label="About you" multiline value={listing.bio} onChangeText={setListingValue("bio")}/>
      <Field label="About your family" multiline value={listing.familyNote} onChangeText={setListingValue("familyNote")}/>
      <Field label="What you are looking for" multiline value={listing.lookingFor} onChangeText={setListingValue("lookingFor")}/>
      <Button disabled={busy} title={busy ? "Saving…" : "Save listing"} onPress={() => void run(async () => { await api("/rishte/me", { method: "PUT", body: listing }); await load(); })}/>
      <View style={{ height: 10 }}/>
      <Button danger title="Delete listing" disabled={busy} onPress={() => Alert.alert("Delete listing?", "This removes your matrimonial listing.", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => void run(async () => { await api("/rishte/me", { method: "DELETE" }); await load(); }) }])}/>
    </Card> : null}
    {section === "interests" ? <>
      <Text style={s.heading}>Received ({incoming.length})</Text>
      {!incoming.length ? <Empty text="No incoming interests yet."/> : incoming.map(item => <Card key={item.id}>
        <MemberRow member={item.member}/><Chip label={item.status}/>
        {item.message ? <Text style={[s.body, { marginVertical: 12 }]}>{item.message}</Text> : null}
        {item.status === "PENDING" ? <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Button disabled={busy} title="Accept" onPress={() => action(item.id, "ACCEPT")}/></View>
          <View style={{ flex: 1 }}><Button disabled={busy} title="Decline" secondary onPress={() => action(item.id, "DECLINE")}/></View>
        </View> : null}
      </Card>)}
      <Text style={s.heading}>Sent ({outgoing.length})</Text>
      {!outgoing.length ? <Empty text="No outgoing interests yet."/> : outgoing.map(item => <Card key={item.id}><MemberRow member={item.member}/><Chip label={item.status}/>{item.status === "PENDING" ? <View style={{ marginTop: 11 }}><Button secondary disabled={busy} title="Withdraw" onPress={() => action(item.id, "WITHDRAW")}/></View> : null}</Card>)}
    </> : null}
    <ErrorNote error={error}/>
  </Page>;
}
