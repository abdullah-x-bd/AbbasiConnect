import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, Share, Text, View } from "react-native";
import { api, mediaData } from "../api";
import { pickImage, uploadPost } from "../media";
import { useRefresh } from "../refresh";
import { Avatar, Button, Card, C, Empty, ErrorNote, Field, Page, s, Title, useTask } from "../ui";
import type { Member, Post } from "../types";

function PostPhoto({ id }: { id: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void mediaData("/media/posts/" + id).then(v => { if (active) setUri(v); }).catch(() => undefined);
    return () => { active = false; };
  }, [id]);
  return uri ? <Image source={{ uri }} resizeMode="cover" style={{ width: "100%", aspectRatio: 1.65, borderRadius: 12, marginVertical: 10 }}/> : null;
}
export default function Community({ member }: { member: Member }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string,string>>({});
  const { busy, error, run } = useTask();
  const load = useCallback(async () => {
    const data = await api<{ posts: Post[] }>("/community/feed");
    setPosts(data.posts || []);
  }, []);
  const { refresh, refreshing } = useRefresh(load, [load], 15000);

  function publish() {
    void run(async () => {
      if (photo) await uploadPost(text.trim(), photo);
      else await api("/community/posts", { method: "POST", body: { body: text.trim() } });
      setText(""); setPhoto(null); await load();
    });
  }
  function like(post: Post) { void run(async () => { await api("/community/posts/" + post.id + "/like", { method: "POST", body: {} }); await load(); }); }
  function comment(post: Post) {
    const body = (commentDrafts[post.id] || "").trim();
    if (!body) return;
    void run(async () => {
      await api("/community/posts/" + post.id + "/comments", { method: "POST", body: { body } });
      setCommentDrafts(d => ({ ...d, [post.id]: "" })); await load();
    });
  }
  function removePost(post: Post) {
    Alert.alert("Delete post?", "This cannot be undone.", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => void run(async () => { await api("/community/posts/" + post.id, { method: "DELETE" }); await load(); }) }]);
  }
  return <Page refresh={refresh} refreshing={refreshing}>
    <Title title="Community" caption="Share the moments that bring us together."/>
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 }}><Avatar member={member}/><Text style={s.heading}>Share something</Text></View>
      <Field label="What's on your mind?" value={text} multiline maxLength={2500} onChangeText={setText} placeholder="Write an update…"/>
      {photo ? <Image source={{ uri: photo }} style={{ height: 160, borderRadius: 12, marginBottom: 10 }}/> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Button secondary title={photo ? "Change photo" : "Add photo"} onPress={() => void run(async () => setPhoto(await pickImage()))}/></View>
        <View style={{ flex: 1 }}><Button disabled={busy || (!photo && !text.trim())} title={busy ? "Posting…" : "Post"} onPress={publish}/></View>
      </View>
      {photo ? <View style={{ marginTop: 7 }}><Button small secondary title="Remove photo" onPress={() => setPhoto(null)}/></View> : null}
    </Card>
    {!posts.length ? <Empty text="No posts yet. Start the conversation."/> : posts.map(post => <Card key={post.id}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Avatar member={post.author}/>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: C.navy }}>{post.author.displayName}</Text><Text style={s.subtle}>{new Date(post.createdAt).toLocaleString()}</Text></View>
        {post.author.id === member.id ? <Pressable accessibilityRole="button" onPress={() => removePost(post)}><Text style={{ color: C.red, fontWeight: "700" }}>Delete</Text></Pressable> : null}
      </View>
      {post.body ? <Text style={s.body}>{post.body}</Text> : null}
      <PostPhoto id={post.id}/>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 10 }}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => like(post)}><Text style={{ color: post.likedByMe ? C.teal : C.muted, fontWeight: "700" }}>{post.likedByMe ? "♥ Liked" : "♡ Like"} ({post.likeCount || 0})</Text></Pressable>
        <Text style={s.subtle}>{post.commentCount || 0} comments</Text>
        <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: post.body || "AbbasiConnect community post" })}><Text style={{ color: C.teal }}>Share</Text></Pressable>
      </View>
      {(post.comments || []).map(comment => <View key={comment.id} style={{ borderTopWidth: 1, borderColor: C.border, paddingVertical: 8 }}>
        <Text style={{ color: C.navy, fontWeight: "700" }}>{comment.author.displayName}</Text>
        <Text style={s.body}>{comment.body}</Text>
        {comment.author.id === member.id ? <Pressable accessibilityRole="button" onPress={() => Alert.alert("Delete comment?", "", [{ text: "Cancel" }, { text: "Delete", onPress: () => void run(async () => { await api("/community/comments/" + comment.id, { method: "DELETE" }); await load(); }) }])}><Text style={{ color: C.red, fontSize: 12, marginTop: 5 }}>Delete comment</Text></Pressable> : null}
      </View>)}
      <Field label="Add a comment" value={commentDrafts[post.id] || ""} maxLength={1000} onChangeText={value => setCommentDrafts(d => ({ ...d, [post.id]: value }))}/>
      <Button secondary small disabled={busy || !(commentDrafts[post.id] || "").trim()} title="Comment" onPress={() => comment(post)}/>
    </Card>)}
    <ErrorNote error={error}/>
  </Page>;
}
