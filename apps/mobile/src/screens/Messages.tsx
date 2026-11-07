import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api";
import { decryptMessage, encryptMessage, getMyPublicKey, isUnlocked, prepareMessaging } from "../crypto";
import { useRefresh } from "../refresh";
import { Button, Card, C, Empty, ErrorNote, Field, MemberRow, Page, s, Title, useTask } from "../ui";
import type { EncryptedMessage, Member, Thread } from "../types";

type OpenThread = { id: string; member: Member; otherPublicKey?: string | null; encryptionReady: boolean; messages: (EncryptedMessage & { plain?: string | null })[] };
export default function Messages({ member }: { member: Member }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<OpenThread | null>(null);
  const [unlocked, setUnlocked] = useState(isUnlocked(member.id));
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [opening, setOpening] = useState(false);
  const { busy, error, run } = useTask();
  const chatRef = useRef<ScrollView>(null);

  const loadThreads = useCallback(async () => {
    const data = await api<{ threads: Thread[] }>("/messages-secure/threads");
    setThreads(data.threads || []);
  }, []);
  const { refresh, refreshing } = useRefresh(loadThreads, [loadThreads], 9000);
  const readConversation = useCallback(async (id: string) => {
    const result = await api<OpenThread>("/messages-secure/threads/" + id);
    const messages = await Promise.all((result.messages || []).map(async message => {
      if (!message.encrypted) return { ...message, plain: message.body || "", legacy: true };
      if (!isUnlocked(member.id)) return { ...message, plain: null };
      try { return { ...message, plain: await decryptMessage(message as any, member.id) }; }
      catch { return { ...message, plain: null }; }
    }));
    setActive({ ...result, messages });
  }, [member.id]);

  useEffect(() => {
    if (!active?.id) return;
    const id = active.id;
    const timer = setInterval(() => { void readConversation(id).catch(() => undefined); }, 7000);
    return () => clearInterval(timer);
  }, [active?.id, readConversation]);
  function open(id: string) {
    void run(async () => {
      setOpening(true);
      try { await readConversation(id); } finally { setOpening(false); }
    });
  }
  function start(person: Member) {
    void run(async () => {
      const data = await api<{ thread: { id: string } }>("/messages-secure/threads/" + person.id, { method: "POST" });
      setResults([]); setQuery("");
      await loadThreads();
      await readConversation(data.thread.id);
    });
  }
  function unlock() {
    void run(async () => {
      await prepareMessaging(member.id, password);
      setUnlocked(true); setPassword("");
      if (active?.id) await readConversation(active.id);
    });
  }
  function send() {
    void run(async () => {
      if (!active || !active.otherPublicKey || !draft.trim()) return;
      if (!isUnlocked(member.id)) throw new Error("Unlock encrypted messages first");
      const me = await getMyPublicKey();
      const payload = await encryptMessage(draft.trim(), me, active.otherPublicKey);
      await api("/messages-secure/threads/" + active.id + "/messages", { method: "POST", body: payload });
      setDraft("");
      await readConversation(active.id); await loadThreads();
    });
  }
  if (!active) return <Page refresh={refresh} refreshing={refreshing}>
    <Title title="Messages" caption="Private conversations with your people."/>
    {!unlocked ? <Card><Text style={s.heading}>Unlock secure messages</Text><Text style={[s.subtle, { marginBottom: 10 }]}>Use your account password to unlock the existing encrypted key backup. This does not create a new identity when one already exists.</Text><Field label="Account password" value={password} secureTextEntry onChangeText={setPassword}/><Button title={busy ? "Unlocking…" : "Unlock messages"} disabled={busy || !password} onPress={unlock}/></Card> : <Card><Text style={{ color: C.teal, fontWeight: "700" }}>Encrypted messaging unlocked on this device</Text></Card>}
    <Card><Text style={s.heading}>Start a conversation</Text><Field label="Search member" value={query} onChangeText={setQuery}/>
      <Button small secondary title="Find member" disabled={busy || !query.trim()} onPress={() => void run(async () => { const data = await api<{ members: Member[] }>("/directory?q=" + encodeURIComponent(query)); setResults(data.members || []); })}/>
      {results.map(person => <View key={person.id} style={{ borderTopWidth: 1, borderColor: C.border, marginTop: 9, paddingTop: 9 }}><MemberRow member={person}/><Button small secondary title="Open conversation" onPress={() => start(person)}/></View>)}
    </Card>
    <Text style={s.heading}>Conversations ({threads.length})</Text>
    {!threads.length ? <Empty text="You haven't started any conversations yet."/> : threads.map(thread => <Pressable accessibilityRole="button" key={thread.id} onPress={() => open(thread.id)} style={s.card}>
      <MemberRow member={thread.member}/>
      <Text style={s.subtle}>{thread.lastMessage?.encrypted ? "Encrypted message" : thread.lastMessage?.body || "No messages yet"}</Text>
    </Pressable>)}
    <ErrorNote error={error}/>
  </Page>;

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderColor: C.border, padding: 14 }}>
      <Pressable onPress={() => setActive(null)} style={{ marginBottom: 7 }}><Text style={{ color: C.teal, fontWeight: "700" }}>‹ All messages</Text></Pressable>
      <MemberRow member={active.member}/>
      <Text style={s.subtle}>{active.encryptionReady ? "Encrypted conversation" : "Waiting for this member's secure messaging keys"}</Text>
    </View>
    <ScrollView ref={chatRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }} onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}>
      {!active.messages.length ? <Empty text="Start your conversation."/> : active.messages.map(message => <View key={message.id} style={{ alignItems: message.senderId === member.id ? "flex-end" : "flex-start", marginBottom: 10 }}>
        <View style={{ backgroundColor: message.senderId === member.id ? C.mint : C.white, borderRadius: 15, borderWidth: 1, borderColor: C.border, padding: 13, maxWidth: "84%" }}>
          <Text style={s.body}>{message.plain ?? "Encrypted message. Unlock to read."}</Text>
          {!message.encrypted ? <Text style={s.subtle}>Earlier unencrypted message</Text> : null}
          <Text style={[s.subtle, { marginTop: 5, fontSize: 10 }]}>{new Date(message.createdAt).toLocaleTimeString()}</Text>
        </View>
      </View>)}
    </ScrollView>
    {!unlocked ? <View style={{ padding: 12, backgroundColor: C.white }}><Field label="Account password" secureTextEntry value={password} onChangeText={setPassword}/><Button title="Unlock messages" onPress={unlock} disabled={!password || busy}/></View> : null}
    <View style={{ padding: 12, flexDirection: "row", gap: 10, alignItems: "flex-end", backgroundColor: C.white, borderTopWidth: 1, borderColor: C.border }}>
      <View style={{ flex: 1 }}><Field label="Message" multiline value={draft} onChangeText={setDraft} placeholder="Type your message…" /></View>
      <Button small title={opening ? "Opening…" : "Send"} disabled={busy || !unlocked || !active.encryptionReady || !draft.trim()} onPress={send}/>
    </View>
    <ErrorNote error={error}/>
  </KeyboardAvoidingView>;
}
