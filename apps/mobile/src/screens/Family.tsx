import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api";
import FamilyGraph from "../components/FamilyGraph";
import { Avatar, Button, Card, Chip, C, Empty, ErrorNote, Field, MemberRow, Page, s, Title, useTask } from "../ui";
import { useRefresh } from "../refresh";
import type { AccessRequest, FamilyEdge, FamilyLink, FamilyNode, FamilyTree, Member } from "../types";

const RELATIONS = ["PARENT", "CHILD", "SIBLING", "SPOUSE", "OTHER"] as const;
function RelationTree({ tree }: { tree: FamilyTree }) {
  const root = tree.nodes.find(n => n.id === tree.rootId);
  // Show every edge in a legible scrollable relationship graph, including
  // invitation-only nodes. Native list layout accommodates long names/accessibility.
  const linked = new Map(tree.nodes.map(n => [n.id, n]));
  return <Card>
    <Text style={s.heading}>Connected family</Text><FamilyGraph tree={tree}/>
    {root ? <View style={{ alignItems: "center", paddingBottom: 12 }}><Avatar member={root} size={56}/><Text style={[s.body, { fontWeight: "700", marginTop: 7 }]}>{root.displayName}</Text><Chip label="Tree root"/></View> : null}
    {tree.edges.length ? tree.edges.map(edge => {
      const from = linked.get(edge.from); const to = linked.get(edge.to);
      return <View key={edge.id} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11 }}>
        <Text style={s.subtle}>{(from?.displayName || "Member") + "  →  " + (to?.displayName || "Invited relative")}</Text>
        <Text style={[s.body, { color: C.teal, fontWeight: "700" }]}>{edge.relationLabel || edge.relation}{edge.status !== "VERIFIED" ? " · Pending verification" : ""}</Text>
      </View>;
    }) : <Text style={s.subtle}>Add a relative to start connecting your family.</Text>}
    <Text style={[s.subtle, { marginTop: 8 }]}>{tree.nodes.length + " people · " + tree.edges.length + " connections"}</Text>
  </Card>;
}
export default function Family({ member }: { member: Member }) {
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [incoming, setIncoming] = useState<AccessRequest[]>([]);
  const [outgoing, setOutgoing] = useState<AccessRequest[]>([]);
  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [viewed, setViewed] = useState(member.id);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [newMember, setNewMember] = useState({ name: "", relation: "SIBLING", label: "" });
  const [claimCode, setClaimCode] = useState("");
  const [section, setSection] = useState<"tree" | "connections" | "privacy">("tree");
  const { busy, error, run } = useTask();

  const load = useCallback(async () => {
    const payload = await api<{ links: FamilyLink[]; incomingAccess: AccessRequest[]; outgoingAccess: AccessRequest[] }>("/family/me");
    setLinks(payload.links || []);
    setIncoming(payload.incomingAccess || []);
    setOutgoing(payload.outgoingAccess || []);
    try { setTree(await api<FamilyTree>("/family/tree/" + viewed)); } catch { setTree(null); }
  }, [viewed]);
  const { refresh, refreshing } = useRefresh(load, [load], 18000);
  const selectedName = tree?.nodes?.find(n => n.id === viewed)?.displayName || member.displayName;

  function updateRequest(id: string, action: "APPROVE" | "DECLINE" | "REVOKE") {
    void run(async () => { await api("/family/access/" + id, { method: "PATCH", body: { action } }); await load(); });
  }
  function addRelative() {
    void run(async () => {
      await api("/family/members", { method: "POST", body: { relativeName: newMember.name.trim(), relation: newMember.relation, relationLabel: newMember.label.trim() } });
      setNewMember({ name: "", relation: "SIBLING", label: "" });
      await load();
    });
  }
  return <Page refresh={refresh} refreshing={refreshing}>
    <Title title="Family tree" caption="The connections that make us who we are."/>
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
      {(["tree", "connections", "privacy"] as const).map(x => <View style={{ flex: 1 }} key={x}><Button secondary={section !== x} small title={x === "tree" ? "Tree" : x === "privacy" ? "Privacy" : "Relatives"} onPress={() => setSection(x)}/></View>)}
    </View>
    {section === "tree" ? <>
      {tree ? <RelationTree tree={tree}/> : <Empty text="The selected family tree is not available or requires access."/>}
      {viewed !== member.id ? <Button secondary title={"Back to my tree"} onPress={() => setViewed(member.id)}/> : null}
      <Card><Text style={s.heading}>Add a relative</Text>
        <Field label="Relative's full name" value={newMember.name} onChangeText={v => setNewMember(p => ({ ...p, name: v }))}/>
        <Text style={s.label}>Relationship to you</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 11 }}>
          {RELATIONS.map(relation => <Pressable key={relation} onPress={() => setNewMember(p => ({ ...p, relation }))} style={{ paddingHorizontal: 13, paddingVertical: 10, marginRight: 7, borderRadius: 10, backgroundColor: newMember.relation === relation ? C.teal : C.mint }}><Text style={{ color: newMember.relation === relation ? C.white : C.teal, fontWeight: "700" }}>{relation}</Text></Pressable>)}
        </ScrollView>
        <Field label="Relationship label (optional)" value={newMember.label} onChangeText={v => setNewMember(p => ({ ...p, label: v }))} placeholder="e.g. Uncle, Grandmother"/>
        <Button disabled={busy || !newMember.name.trim()} title="Add family member" onPress={addRelative}/>
      </Card>
      <Card><Text style={s.heading}>Claim an invitation</Text>
        <Text style={[s.subtle, { marginBottom: 12 }]}>Enter the invitation code a relative gave you.</Text>
        <Field label="Invitation code" autoCapitalize="characters" value={claimCode} onChangeText={setClaimCode}/>
        <Button disabled={busy || !claimCode.trim()} title="Claim family link" onPress={() => void run(async () => { await api("/family/claim", { method: "POST", body: { code: claimCode.trim() } }); setClaimCode(""); await load(); })}/>
      </Card>
    </> : null}
    {section === "connections" ? <>
      <Text style={s.heading}>My family links</Text>
      {!links.length ? <Empty text="No family members added yet."/> : links.map(link => <Card key={link.id}>
        <Text style={[s.body, { fontWeight: "700" }]}>{link.relativeUser?.displayName || link.relativeName}</Text>
        <Text style={s.subtle}>{(link.relationLabel || link.relation) + " · " + link.status}</Text>
        {link.status === "INVITED" ? <Text selectable style={{ marginTop: 8, color: C.teal, fontWeight: "800" }}>Invite code: {link.inviteCode}</Text> : null}
      </Card>)}
      <Card><Text style={s.heading}>Find relatives on AbbasiConnect</Text>
        <Field label="Name, username, or city" value={search} onChangeText={setSearch}/>
        <Button secondary disabled={busy || search.trim().length < 2} title="Search members" onPress={() => void run(async () => {
          const data = await api<{ members: Member[] }>("/family/search?q=" + encodeURIComponent(search.trim()));
          setResults(data.members || []);
        })}/>
        {results.map(person => <View key={person.id} style={{ borderBottomWidth: 1, borderBottomColor: C.border }}>
          <MemberRow member={person}/>
          <Button small secondary title="Request to view tree" onPress={() => void run(async () => { await api("/family/access/" + person.id, { method: "POST" }); await load(); })}/>
          <View style={{ height: 9 }}/>
        </View>)}
      </Card>
    </> : null}
    {section === "privacy" ? <>
      <Card><Text style={s.heading}>Requests to view your tree</Text>
        {!incoming.length ? <Text style={s.subtle}>No access requests.</Text> : incoming.map(item => <View key={item.id} style={{ marginBottom: 14 }}>
          <MemberRow member={item.member}/><Chip label={item.status}/>
          <View style={{ flexDirection: "row", gap: 7, marginTop: 9 }}>
            {item.status === "PENDING" ? <><View style={{ flex: 1 }}><Button small title="Approve" onPress={() => updateRequest(item.id, "APPROVE")}/></View><View style={{ flex: 1 }}><Button small secondary title="Decline" onPress={() => updateRequest(item.id, "DECLINE")}/></View></> : <Button small secondary title="Revoke" onPress={() => updateRequest(item.id, "REVOKE")}/>}
          </View>
        </View>)}
      </Card>
      <Card><Text style={s.heading}>Your requests to others</Text>
        {!outgoing.length ? <Text style={s.subtle}>No outgoing requests.</Text> : outgoing.map(item => <View key={item.id} style={{ marginBottom: 13 }}>
          <MemberRow member={item.member}/>
          <Chip label={item.status}/>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
            {item.status === "APPROVED" ? <Button small title="View tree" onPress={() => { setViewed(item.member.id); setSection("tree"); }}/> : null}
            {item.status !== "REVOKED" ? <Button small secondary title="Revoke" onPress={() => updateRequest(item.id, "REVOKE")}/> : null}
          </View>
        </View>)}
      </Card>
    </> : null}
    <ErrorNote error={error}/>
  </Page>;
}
