import { Alert, Linking } from "react-native";

export async function openExternalUrl(url: string | null | undefined, failureMessage: string) {
  if (!url) {
    Alert.alert("Unavailable", failureMessage);
    return;
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("Unavailable", failureMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open", failureMessage);
  }
}

export async function openCall(telHref: string | null) {
  return openExternalUrl(telHref, "Unable to open phone app.");
}

export async function openWhatsApp(waHref: string | null) {
  return openExternalUrl(
    waHref,
    "WhatsApp could not be opened. Install WhatsApp or try again."
  );
}
