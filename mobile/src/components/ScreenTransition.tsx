import { useEffect, useRef } from "react"
import { Animated, Easing, ViewStyle } from "react-native"

type Direction = "fromRight" | "fromLeft"

export default function ScreenTransition({ children, direction = "fromRight", enabled = true, style }: { children: React.ReactNode; direction?: Direction; enabled?: boolean; style?: ViewStyle }) {
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => { if (!enabled) { progress.setValue(1); return } progress.setValue(0); Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start() }, [enabled, progress])
  const offset = direction === "fromRight" ? 36 : -36
  return <Animated.View style={[style, { flex: 1, opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] }]}>{children}</Animated.View>
}
