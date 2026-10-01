import type { AvatarStyle } from "@rakazo/contracts";
import {
  ACTIVE_RUN_STATUSES,
  avatarIdentitySeed,
  organicAvatarPath,
  SHIPPED_BOT_AVATAR_CENTER,
  SHIPPED_BOT_AVATAR_VIEWBOX,
} from "@rakazo/core";
import { memo, useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Ellipse, G, Path, Rect } from "react-native-svg";
import type { AvatarLifecycleState } from "../lib/avatar-motion";
import {
  avatarLifecycleDuration,
  avatarLifecycleFrame,
  resolveAvatarLifecycle,
  workingAvatarDuration,
  workingAvatarFrame,
} from "../lib/avatar-motion";
import { mobileBotAvatarPresentation } from "../lib/bot-avatar";

import { useI18n } from "../lib/i18n";
import { useAvatarStyle } from "./avatar-style";
import { NativeSymbol } from "./native-symbol";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export const BotAvatar = memo(function BotAvatar({
  color,
  size = 54,
  status,
  lifecycle: lifecycleProp,
  identity,
  variant,
  muted = false,
}: {
  color: string;
  size?: number;
  status?: string;
  lifecycle?: AvatarLifecycleState;
  identity?: string;
  variant?: AvatarStyle;
  muted?: boolean;
}) {
  const { t } = useI18n();
  const [transientDone, setTransientDone] = useState(false);
  const prevStatusRef = useRef<string | undefined>(status);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }

    if (status === "completed" && prev && prev !== "completed" && prev !== "idle") {
      setTransientDone(true);
      doneTimerRef.current = setTimeout(() => {
        setTransientDone(false);
      }, 1400);
      return () => {
        if (doneTimerRef.current) {
          clearTimeout(doneTimerRef.current);
          doneTimerRef.current = null;
        }
      };
    }
    setTransientDone(false);
  }, [status]);

  const rawLifecycle = resolveAvatarLifecycle(status);
  const effectiveLifecycle: AvatarLifecycleState =
    rawLifecycle === "done" && !transientDone ? "idle" : rawLifecycle;
  const lifecycle = lifecycleProp ?? (transientDone ? "done" : effectiveLifecycle);
  const isWorking =
    ACTIVE_RUN_STATUSES.some((activeStatus) => activeStatus === status) || lifecycle === "working";
  const { avatarStyle } = useAvatarStyle();
  const parsed = mobileBotAvatarPresentation(color);

  const fillColor = parsed.kind === "shape" || parsed.kind === "color" ? parsed.color : color;
  const visorW = Math.round(size * 0.68);
  const visorH = Math.round(size * 0.44);
  const eyeW = Math.max(3, Math.round(size * 0.11));
  const eyeH = Math.max(4, Math.round(size * 0.17));
  const gap = Math.max(3, Math.round(size * 0.11));
  const picture =
    parsed.kind === "image" && parsed.imageUrl ? (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
        }}
      >
        <Image source={{ uri: parsed.imageUrl }} style={{ width: size, height: size }} />
      </View>
    ) : parsed.kind === "shape" ? (
      <ShippedShapeAvatar
        color={parsed.color}
        eyeColor={parsed.eyeColor}
        shapePath={parsed.shapePath}
        size={size}
        lifecycle={lifecycle}
      />
    ) : (variant ?? avatarStyle) === "organic" ? (
      <OrganicAvatar
        color={fillColor}
        identity={identity}
        size={size}
        lifecycle={lifecycle}
      />
    ) : (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fillColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >

        <View
          style={{
            width: visorW,
            height: visorH,
            borderRadius: Math.round(visorH * 0.52),
            backgroundColor: "#0C0C0E",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap,
          }}
        >
          {[0, 1].map((eye) => (
            <View
              key={eye}
              style={{
                width: eyeW,
                height: eyeH,
                borderRadius: Math.max(2, Math.round(eyeW * 0.6)),
                backgroundColor: "#fff",
              }}
            />
          ))}
        </View>
      </View>
    );
  return (
    <View style={{ width: size, height: size }}>
      {picture}
      {isWorking ? (
        <View
          accessibilityLabel={t("Working")}
          style={{
            position: "absolute",
            right: muted ? undefined : 0,
            left: muted ? 0 : undefined,
            bottom: 0,
            width: Math.max(6, Math.round(size * 0.18)),
            height: Math.max(6, Math.round(size * 0.18)),
            borderRadius: size,
            backgroundColor: "#F5A03C",
          }}
        />
      ) : null}
      {muted ? (
        <View
          accessible
          accessibilityLabel={t("Notifications silenced")}
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: Math.max(14, Math.round(size * 0.34)),
            height: Math.max(14, Math.round(size * 0.34)),
            borderRadius: size,
            borderWidth: 2,
            borderColor: "#000",
            backgroundColor: "#242428",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NativeSymbol
            ios="bell.slash.fill"
            android="notifications-off"
            size={Math.max(8, Math.round(size * 0.17))}
            color="#ECECEE"
          />
        </View>
      ) : null}
    </View>
  );
});

function ShippedShapeAvatar({
  color,
  eyeColor,
  shapePath,
  size,
  lifecycle = "idle",
}: {
  color: string;
  eyeColor: string;
  shapePath: string;
  size: number;
  lifecycle?: AvatarLifecycleState;
}) {
  const center = SHIPPED_BOT_AVATAR_CENTER;
  const isThinking = lifecycle === "thinking";
  const isBlocked = lifecycle === "blocked";
  const isError = lifecycle === "error";
  const eyeShiftY = isThinking ? -3.5 : isError ? 2 : 0;
  const eyeShiftX = isThinking ? 2.5 : 0;
  const eyeScale = isBlocked ? 1.08 : isError ? 0.96 : 1;

  const containerStyle = isBlocked
    ? { transform: [{ rotate: "4deg" }] }
    : isError
      ? { transform: [{ translateY: 1.5 }, { scale: 0.98 }] }
      : undefined;

  return (
    <View style={containerStyle}>
      <Svg width={size} height={size} viewBox={SHIPPED_BOT_AVATAR_VIEWBOX}>
        <Path d={shapePath} fill={color} />
        <G
          fill={eyeColor}
          transform={`translate(${eyeShiftX}, ${eyeShiftY}) scale(${eyeScale})`}
        >
          <Ellipse cx={center - 29} cy={center - 8} rx={10} ry={7} />
          <Ellipse cx={center + 29} cy={center - 8} rx={10} ry={7} />
        </G>
      </Svg>
    </View>
  );
}

function OrganicAvatar({
  color,
  identity,
  size,
  lifecycle,
}: {
  color: string;
  identity?: string;
  size: number;
  lifecycle: AvatarLifecycleState;
}) {
  const seed = avatarIdentitySeed(identity || color || "#8B5CF6");
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const isActive = lifecycle !== "idle";

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (lifecycle === "done" && !reducedMotion) {
      progress.value = withTiming(1, {
        duration: 1200,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      });
    } else if (isActive && !reducedMotion) {
      progress.value = withRepeat(
        withTiming(1, {
          duration: avatarLifecycleDuration(seed, lifecycle),
          easing: Easing.linear,
        }),
        -1,
      );
    }
    return () => cancelAnimation(progress);
  }, [isActive, lifecycle, progress, reducedMotion, seed]);


  const bodyStyle = useAnimatedStyle(() => {
    const frame = avatarLifecycleFrame(seed, lifecycle, progress.value);
    return {
      transform: [
        { translateX: (frame.translationX * size) / 120 },
        { translateY: (frame.translationY * size) / 120 },
        { rotate: `${frame.rotation}deg` },
        { scaleX: frame.scaleX },
        { scaleY: frame.scaleY },
      ],
    };
  });
  const leftEyeProps = useAnimatedProps(() => {
    const frame = avatarLifecycleFrame(seed, lifecycle, progress.value);
    return { x: -14 + frame.eyeOffsetX, y: -12 + frame.eyeOffsetY };
  });
  const rightEyeProps = useAnimatedProps(() => {
    const frame = avatarLifecycleFrame(seed, lifecycle, progress.value);
    return { x: 7 + frame.eyeOffsetX, y: -12 + frame.eyeOffsetY };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        <Svg width={size} height={size} viewBox="-60 -60 120 120">
          <Path d={organicAvatarPath(seed)} fill={color} />
          <G transform={`rotate(${(seed % 9) - 4})`}>
            <AnimatedRect
              animatedProps={leftEyeProps}
              width={7}
              height={24}
              rx={3.5}
              fill="#101014"
            />
            <AnimatedRect
              animatedProps={rightEyeProps}
              width={7}
              height={24}
              rx={3.5}
              fill="#101014"
            />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

