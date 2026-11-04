import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

type TabsVariant = "underline" | "segmented";
const TabsVariantContext = React.createContext<TabsVariant>("underline");

const listVariants: Record<TabsVariant, string> = {
  underline:
    "scrollbar-hidden flex h-auto max-w-full items-end justify-start gap-1 overflow-x-auto overflow-y-hidden border-b border-border bg-transparent p-0 text-muted-foreground",
  segmented: "inline-flex h-auto items-center justify-center gap-1 rounded-[10px] bg-muted p-1 text-muted-foreground",
};

const triggerVariants: Record<TabsVariant, string> = {
  underline:
    "-mb-px min-h-11 shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-[15px] font-normal shadow-none hover:text-foreground data-[state=active]:border-gold data-[state=active]:font-bold data-[state=active]:text-foreground",
  segmented:
    "min-h-9 rounded-[8px] border border-transparent px-3 py-1 text-sm font-medium hover:text-foreground data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground",
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      data-variant={variant}
      className={cn(listVariants[variant], className)}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap ring-offset-background cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
        triggerVariants[variant],
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
