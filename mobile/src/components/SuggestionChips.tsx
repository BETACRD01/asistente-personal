import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  dark: boolean;
  suggestions: string[];
  onSelect: (text: string) => void;
}

function SuggestionChips({ dark, suggestions, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, dark ? styles.textDark : null]}>Sugerencias</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {suggestions.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => onSelect(s)}
            style={[styles.chip, dark ? styles.chipDark : null]}>
            <Text style={[styles.chipText, dark ? styles.textDark : null]}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginTop: 12 },
  label: { fontSize: 13, color: '#6e6e73', marginBottom: 8 },
  chips: { gap: 8, paddingRight: 20 },
  chip: {
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipDark: { backgroundColor: '#2c2c2e', borderColor: '#3a3a3c' },
  chipText: { color: '#1d1d1f', fontSize: 14 },
  textDark: { color: '#ffffff' },
});

export default SuggestionChips;