import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { api } from "../api";
import { Button, Card, Chip, C, Empty, ErrorNote, Field, Page, s, Title, useTask } from "../ui";
import { useRefresh } from "../refresh";

export default function Admin({ logout }: { logout: () => void }) {
  const [overview, setOverview] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState<"overview" | "users" | "reports">("overview");
  const { busy, error, run } = useTask();
  const load = useCallback(async () => {
    const [o, u, r] = await Promise.all([
      api("/admin/overview"),
      api<{ users: any[] }>("/admin/users?q=" + encodeURIComponent(q)),
      api<{ reports: any[] }>("/admin/reports")
    ]);
    setOverview(o); setUsers(u.users || []); setReports(r.reports || []);
  }, [q]);
  const { refresh, refreshing } = useRefresh(load, [load], 20000);
  function userAction(user: any, suspended: boolean) {
    void run(async () => {
      await api("/admin/users/" + user.id, { method: "PATCH", body: { action: suspended ? "RESTORE" : "SUSPEND" } });
      await load();
    });
  }
  function reportAction(report: any, action: "DISMISS" | "SUSPEND_USER" | "RESTORE_USER") {
    void run(async () => { await api("/admin/reports/" + report.id, { method: "PATCH", body: { action } }); await load(); });
  }
  return <Page refresh={refresh} refreshing={refreshing}>
    <Title title="Administration" caption="AbbasiConnect member and report oversight."/>
    <View style={{ flexDirection: "row", gap: 7, marginBottom: 12 }}>
      {(["overview","users","reports"] as const).map(x => <View key={x} style={{ flex: 1 }}><Button title={x === "overview" ? "Overview" : x === "users" ? "Users" : "Reports"} small secondary={page !== x} onPress={() => setPage(x)}/></View>)}
    </View>
    {page === "overview" ? <Card><Text style={s.heading}>Platform overview</Text>{Object.entries(overview?.metrics || {}).filter(([, value]) => typeof value !== "object").map(([key, value]) => <View key={key} style={[s.row, { justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderColor: C.border }]}><Text style={s.body}>{key}</Text><Text style={{ fontWeight: "800", color: C.teal }}>{String(value)}</Text></View>)}</Card> : null}
    {page === "users" ? <>
      <Card><Field label="Search members" value={q} onChangeText={setQ}/><Text style={s.subtle}>{users.length} accounts in this result</Text></Card>
      {users.map(u => <Card key={u.id}><Text style={s.heading}>{u.displayName}</Text><Text style={s.subtle}>{"@" + u.username + " · " + u.role}</Text><Chip label={u.suspendedAt ? "Suspended" : "Active"}/>
        <View style={{ marginTop: 12 }}><Button title={u.suspendedAt ? "Restore account" : "Suspend account"} danger={!u.suspendedAt} disabled={busy} onPress={() => Alert.alert(u.suspendedAt ? "Restore account?" : "Suspend account?", u.displayName, [{ text: "Cancel" }, { text: "Continue", onPress: () => userAction(u, Boolean(u.suspendedAt)) }])}/></View>
      </Card>)}
    </> : null}
    {page === "reports" ? (!reports.length ? <Empty text="No reports."/> : reports.map(r => <Card key={r.id}>
      <Text style={s.heading}>{r.reason}</Text><Text style={s.body}>{r.details || "No additional details."}</Text><Chip label={r.status}/>
      <View style={{ marginTop: 10, gap: 7 }}>
        <Button small secondary title="Dismiss report" onPress={() => reportAction(r, "DISMISS")}/>
        {r.reportedUserId ? <><Button small danger title="Suspend reported member" onPress={() => reportAction(r, "SUSPEND_USER")}/><Button small secondary title="Restore reported member" onPress={() => reportAction(r, "RESTORE_USER")}/></> : null}
      </View>
    </Card>)) : null}
    <ErrorNote error={error}/>
    <Button secondary title="Sign out" onPress={logout}/>
  </Page>;
}
