import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** Three pulsing dots: "the other person is speaking". */
export function TypingDots({ color }: { color: string }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 3, duration: 1200, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={styles.row}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: progress.interpolate({
                inputRange: [i, i + 0.5, i + 1, 3],
                outputRange: [0.3, 1, 0.3, 0.3],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
