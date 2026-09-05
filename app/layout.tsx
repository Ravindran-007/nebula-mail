import "@copilotkit/react-ui/styles.css";
import "./globals.css";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";

export const metadata = {
  title: "Nebula Mail — AI Mail",
  description: "Nebula KnowLab AI-powered mail client.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>
          <CopilotSidebar
            labels={{
              title: "Mail Assistant",
              initial:
                "Tell me what to do — \"send an email to...\", \"show me unread mail from this week\", \"open the latest from David\".",
            }}
            defaultOpen={true}
            fullHeightChildren={true}
            clickOutsideToClose={false}
            hitEscapeToClose={false}
          >
            {children}
          </CopilotSidebar>
        </CopilotKit>
      </body>
    </html>
  );
}
