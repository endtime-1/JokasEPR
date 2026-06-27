import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMemo, useState } from "react";
import { colors, font, radius, spacing } from "../constants/theme";

export type SelectOption = { label: string; value: string };

const SEARCH_THRESHOLD = 8; // show search box when list exceeds this count

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
};

export function SelectField({ label, value, options, onChange, error, placeholder = "Select…", required }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const showSearch = options.length > SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function handleOpen() {
    setQuery("");
    setOpen(true);
  }

  function handleClose() {
    setQuery("");
    setOpen(false);
  }

  function handleSelect(val: string) {
    onChange(val);
    handleClose();
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        onPress={handleOpen}
        style={[styles.trigger, error && styles.triggerError, open && styles.triggerFocused]}
        activeOpacity={0.75}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={[styles.caret, open && styles.caretOpen]}>›</Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{label}</Text>

            {showSearch && (
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search…"
                  placeholderTextColor={colors.inkLight}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No results for "{query}"</Text>
                </View>
              ) : (
                filtered.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.option, o.value === value && styles.optionSelected]}
                    onPress={() => handleSelect(o.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, o.value === value && styles.optionTextSelected]}>{o.label}</Text>
                    {o.value === value && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.inkMid,
    letterSpacing: 0.1
  },
  required: { color: colors.brand },
  trigger: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgCard,
    gap: spacing.sm
  },
  triggerFocused: { borderColor: colors.brand },
  triggerError: { borderColor: colors.error },
  triggerText: { fontSize: font.size.md, color: colors.ink, flex: 1 },
  placeholder: { color: colors.inkLight },
  caret: {
    color: colors.inkLight,
    fontSize: 20,
    lineHeight: 22,
    transform: [{ rotate: "90deg" }]
  },
  caretOpen: { transform: [{ rotate: "-90deg" }] },
  errorText: { fontSize: font.size.xs, color: colors.error, fontWeight: font.weight.medium },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: "65%"
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    alignSelf: "center",
    marginBottom: spacing.lg
  },
  sheetTitle: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.ink,
    marginBottom: spacing.md
  },
  searchRow: {
    marginBottom: spacing.sm
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.size.md,
    color: colors.ink,
    backgroundColor: colors.bg
  },
  emptyRow: {
    paddingVertical: spacing.xl,
    alignItems: "center"
  },
  emptyText: {
    fontSize: font.size.sm,
    color: colors.inkLight
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: 2
  },
  optionSelected: { backgroundColor: colors.brandLight },
  optionText: { flex: 1, fontSize: font.size.md, color: colors.ink },
  optionTextSelected: { color: colors.brand, fontWeight: font.weight.semibold },
  checkmark: { color: colors.brand, fontSize: 16, fontWeight: "bold" }
});
