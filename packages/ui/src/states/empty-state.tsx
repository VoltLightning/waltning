import { Text, View } from "react-native";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type EmptyStateProps = {
  title: string;
  body: string;
  primaryAction: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
};

export function EmptyState({ title, body, primaryAction, secondaryAction }: EmptyStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        <Button {...primaryAction} variant="primary" size="lg" />
        {secondaryAction ? <Button {...secondaryAction} variant="secondary" /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { alignItems: "center", gap: space.x3, padding: space.x6 },
  title: { color: theme.text, ...text.display("displayTwo") },
  body: { color: theme.textMuted, ...text.ui("body"), textAlign: "center" },
  actions: { width: "100%", gap: space.xl },
}));
