import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import { Avatar, Button, Card, C, ErrorNote, Loading, Page, s, Title } from "../ui";
import { useRefresh } from "../refresh";
import type { Member, Post, Tab } from "../types";

export default function Home({ member, navigate }: { member: Member; navigate: (tab: Tab) => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await api<any>("/performance/bootstrap");
      setData(result);
      setError("");
    } catch {
      try {
        const [communityFeed, family, rishteMine, messageThreads] = await Promise.all([
          api("/community/feed"), api("/family/me"), api("/rishte/me"), api("/messages-secure/threads")
        ]);
        setData({ communityFeed, family, rishteMine, messageThreads });
        setError("");
      } catch (e) { setError(e instanceof Error ? e.message : "Overview could not load"); }
    }
  }, []);
  const { refresh, refreshing } = useRefresh(load, [load], 20000);
  const posts: Post[] = data?.communityFeed?.posts || [];
  const family = data?.family?.links || [];
  const verified = family.filter((x: any) => x.status === "VERIFIED").length;
  const pending = family.filter((x: any) => x.status === "INVITED").length;
  const threads = data?.messageThreads?.threads || [];
  const listing = data?.rishteMine?.profile;
  return <Page refresh={refresh} refreshing={refreshing}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 16 }}>
      <Avatar member={member} size={58}/>
      <View style={{ flex: 1 }}><Title title={"Hello, " + member.displayName.split(" ")[0]} caption="A little closer, wherever you are."/></View>
    </View>
    <Card><Text style={s.heading}>Recent community updates</Text>
      {!data && !error ? <Loading/> : posts.length ? posts.slice(0, 3).map(post => <View key={post.id} style={{ marginBottom: 14 }}>
        <Text style={{ color: C.navy, fontWeight: "700" }}>{post.author.displayName}</Text>
        <Text style={s.body} numberOfLines={3}>{post.body}</Text>
        <Text style={s.subtle}>{new Date(post.createdAt).toLocaleDateString()}</Text>
      </View>) : <Text style={s.subtle}>There are no community posts yet.</Text>}
      <Button title="Open community" secondary onPress={() => navigate("community")}/>
    </Card>
    <Card><Text style={s.heading}>Your family</Text>
      <Text style={[s.body, { marginBottom: 12 }]}>{verified + " verified connections · " + pending + " invitations awaiting claim"}</Text>
      <Button title="Explore family tree" secondary onPress={() => navigate("family")}/>
    </Card>
    <Card><Text style={s.heading}>Rishte</Text>
      <Text style={[s.body, { marginBottom: 12 }]}>{!listing ? "Create your listing when you are ready." : listing.isActive ? "Your listing is visible." : "Your listing is paused."}</Text>
      <Button title="Open Rishte" secondary onPress={() => navigate("rishte")}/>
    </Card>
    <Card><Text style={s.heading}>Messages</Text>
      <Text style={[s.body, { marginBottom: 12 }]}>{threads.length + (threads.length === 1 ? " conversation" : " conversations")}</Text>
      <Button title="Open conversations" secondary onPress={() => navigate("messages")}/>
    </Card>
    <ErrorNote error={error}/>
  </Page>;
}
