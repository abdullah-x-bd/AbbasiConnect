import * as ImagePicker from "expo-image-picker";
import { api } from "./api";

export async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Allow access to photos to select an image");
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: .34, base64: true });
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const dataUrl = "data:image/jpeg;base64," + result.assets[0].base64;
  if (dataUrl.length > 650000) throw new Error("This image is too large. Crop it or choose a smaller image.");
  return dataUrl;
}

export function uploadProfile(dataUrl: string) {
  return api("/media/profile", { method: "PUT", body: { dataUrl } });
}
export function uploadPost(body: string, dataUrl: string) {
  return api("/media/posts", { method: "POST", body: { body, dataUrl } });
}
