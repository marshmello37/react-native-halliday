import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { FC } from "react";
import { SafeAreaView, ScrollView, StyleSheet } from "react-native";
import { Home } from "./src/Home";
import { client } from "./src/client";

const queryClient = new QueryClient();

const App: FC = () => (
  <QueryClientProvider client={queryClient}>
    <client.reactNative.WebView />
    <StatusBar style="auto" />

    <SafeAreaView style={styles.main}>
      <ScrollView>
        <Home />
      </ScrollView>
    </SafeAreaView>
  </QueryClientProvider>
);

const styles = StyleSheet.create({
  main: {
    flex: 1,
  },
});

export default App;
