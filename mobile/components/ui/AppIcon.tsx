import { Platform, StyleSheet, Text, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import { SymbolView } from "expo-symbols";

import { APP_ICONS, MATERIAL_SYMBOLS_FONT, type AppIconName } from "@/constants/icons";
import { colors } from "@/constants/theme";

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}

/**
 * Website CRM icons.
 *
 * - iOS: native SF Symbols via SymbolView (SF string name).
 * - Android/web: Material Symbols glyphs via Text (font preloaded in root layout).
 *
 * Root cause of prior "X" icons: expo-symbols SymbolView on Android maps to Material
 * Symbols PUA codepoints and loads the font asynchronously per mount (errors swallowed).
 * When the face is not applied, Android draws missing-glyph marks (X/□) for those codepoints.
 */
export function AppIcon({ name, size = 18, color = colors.text, style }: AppIconProps) {
  const spec = APP_ICONS[name];

  if (Platform.OS === "ios") {
    return (
      <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
        <SymbolView
          name={spec.ios}
          size={size}
          tintColor={color}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
      <Text
        allowFontScaling={false}
        style={[
          {
            fontFamily: MATERIAL_SYMBOLS_FONT,
            fontSize: size,
            lineHeight: size,
            color,
            textAlign: "center",
            width: size,
            height: size
          },
          Platform.OS === "android" ? ({ includeFontPadding: false } as object) : null
        ]}
      >
        {String.fromCharCode(spec.codepoint)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  }
});
