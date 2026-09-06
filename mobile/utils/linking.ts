import { Alert, Linking } from "react-native";

export async function openExternalUrl(url: string | null | undefined, failureMessage: string) {
  if (!url) {
    Alert.alert("Unavailable", failureMessage);
    return false;
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("Unavailable", failureMessage);
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert("Unable to open", failureMessage);
    return false;
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

export async function openEmail(mailtoHref: string | null) {
  return openExternalUrl(mailtoHref, "Unable to open mail app.");
}
