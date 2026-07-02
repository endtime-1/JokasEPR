import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import {
  fetchAiSession,
  sendAiMessage,
  type AiMessage,
} from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";
import type { MoreStackParams } from "../../navigation/types";

type RouteProps = RouteProp<MoreStackParams, "AiChat">;

function Bubble({ msg }: { msg: AiMessage }) {
  const isUser = msg.role === "user";
  return (
    <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Icon name="robot-outline" size={16} color={colors.brand} />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{msg.content}</Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.bubbleWrap}>
      <View style={styles.avatar}>
        <Icon name="robot-outline" size={16} color={colors.brand} />
      </View>
      <View style={styles.bubbleAssistant}>
        <View style={styles.typingDots}>
          <View style={[styles.dot, styles.dot1]} />
          <View style={[styles.dot, styles.dot2]} />
          <View style={[styles.dot, styles.dot3]} />
        </View>
      </View>
    </View>
  );
}

export function AiChatScreen() {
  const navigation  = useNavigation<any>();
  const route       = useRoute<RouteProps>();
  const toast       = useToast();
  const listRef     = useRef<FlatList<AiMessage>>(null);
  const inputRef    = useRef<TextInput>(null);

  const [messages,  setMessages]  = useState<AiMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(route.params?.sessionId);
  const [input,     setInput]     = useState("");
  const [sending,   setSending]   = useState(false);
  const [loading,   setLoading]   = useState(!!route.params?.sessionId);

  const load = useCallback(async () => {
    if (!route.params?.sessionId) return;
    setLoading(true);
    try {
      const res = await fetchAiSession(route.params.sessionId);
      setMessages(res.data.messages);
      setSessionId(res.data.session.id);
    } catch {
      toast.show({ type: "error", message: "Could not load conversation." });
    } finally {
      setLoading(false);
    }
  }, [route.params?.sessionId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: AiMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await sendAiMessage(text, sessionId);
      setSessionId(res.data.sessionId);
      const assistantMsg: AiMessage = {
        id: `local-reply-${Date.now()}`,
        role: "assistant",
        content: res.data.reply,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      toast.show({ type: "error", message: "Failed to get response. Check your connection." });
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={92}>
        {messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Icon name="robot-excited-outline" size={48} color={colors.brand} />
            </View>
            <Text style={styles.emptyTitle}>Jokas AI Assistant</Text>
            <Text style={styles.emptyDesc}>
              Ask me anything about your farm operations, feed production, sales performance, or financial data.
            </Text>
            <View style={styles.suggestionGrid}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} style={styles.suggestion} onPress={() => { setInput(s); inputRef.current?.focus(); }}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <Bubble msg={item} />}
            contentContainerStyle={styles.list}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={sending ? <TypingIndicator /> : null}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Ask Jokas AI…"
            placeholderTextColor={colors.inkLight}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Icon name="send" size={18} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const SUGGESTIONS = [
  "How is egg production this week?",
  "What's our current feed stock level?",
  "Show me this month's revenue summary",
  "Which flock has the highest mortality?",
];

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: colors.bg },
  flex:  { flex: 1 },
  center:{ flex: 1, alignItems: "center", justifyContent: "center" },
  list:  { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandMid },
  emptyTitle:{ fontSize: font.size.xl - 1, fontFamily: font.family.extrabold, color: colors.ink, textAlign: "center" },
  emptyDesc: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular, textAlign: "center", lineHeight: 20 },

  suggestionGrid: { gap: spacing.sm, width: "100%" },
  suggestion:     { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.brandMid, padding: spacing.md, ...shadow.sm },
  suggestionText: { fontSize: font.size.sm, fontFamily: font.family.medium, color: colors.brand },

  bubbleWrap:     { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  bubbleWrapUser: { flexDirection: "row-reverse" },
  avatar:         { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandMid },

  bubble:          { maxWidth: "78%", borderRadius: radius.xl, padding: spacing.md },
  bubbleUser:      { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4, ...shadow.sm },
  bubbleText:      { fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, lineHeight: 20 },
  bubbleTextUser:  { color: colors.white },

  typingDots: { flexDirection: "row", gap: 4, alignItems: "center", paddingVertical: 4, paddingHorizontal: 4 },
  dot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.inkLight },
  dot1:       {},
  dot2:       { opacity: 0.6 },
  dot3:       { opacity: 0.35 },

  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgCard },
  input:    { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg, maxHeight: 120 },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", ...shadow.sm },
  sendBtnDisabled: { backgroundColor: colors.inkLight },
});
