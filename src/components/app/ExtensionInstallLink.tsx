import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CHROME_EXTENSION_URL, extensionInstalledVersion } from "@/components/marketing/chrome-extension-content";

/** Buton „Instalează extensia”; dacă extensia e instalată (atributul data-habitoo-extension pe <html>), arată versiunea. */
export function ExtensionInstallLink() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    setVersion(extensionInstalledVersion(document.documentElement.dataset.habitooExtension));
  }, []);

  if (version) {
    return (
      <span className="text-sm text-muted-foreground" data-testid="extension-installed">
        Extensia e instalată (versiunea {version})
      </span>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer">Instalează extensia</a>
    </Button>
  );
}
