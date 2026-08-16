import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatMessage } from '../api/hubClient';

function Avatar({ dark }: { dark: boolean }) {
  return (
    <View style={[styles.avatar, dark ? styles.avatarDark : styles.avatarLight]}>
      <Text style={styles.avatarText}>🤖</Text>
    </View>
  );
}

function MessageBubble({ item, dark }: { item: ChatMessage; dark: boolean }) {
  if (item.role === 'user') {
    return (
      <View style={styles.row}>
        <View style={[styles.userBubble, dark ? styles.userBubbleDark : null]}>
          <Text style={[styles.userText, dark ? styles.textDark : null]}>{item.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Avatar dark={dark} />
      <View style={[styles.assistantBubble, dark ? styles.assistantBubbleDark : null]}>
        <Text style={[styles.assistantText, dark ? styles.textDark : null]}>
          {item.content}
          {item.streaming ? '▌' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarLight: { backgroundColor: '#10a37f' },
  avatarDark: { backgroundColor: '#10a37f' },
  avatarText: { fontSize: 14 },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#10a37f',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
    marginLeft: 'auto',
  },
  userBubbleDark: { backgroundColor: '#10a37f' },
  assistantBubble: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
  },
  assistantBubbleDark: { backgroundColor: '#2c2c2e', borderColor: '#3a3a3c' },
  userText: { color: '#ffffff', fontSize: 15, lineHeight: 21 },
  assistantText: { color: '#1d1d1f', fontSize: 15, lineHeight: 21 },
  textDark: { color: '#ffffff' },
});

export default MessageBubble;