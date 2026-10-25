import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toastError } from "@/lib/errors";
import { deliverCommissionFile } from "@/lib/commissions-download";

export function CommissionExportButton({ prepare, disabled }: { prepare: (type: "xlsx" | "csv") => Promise<{blob:Blob;filename:string}>; disabled: boolean }) {
  const [busy,setBusy]=useState(false), [file,setFile]=useState<{blob:Blob;filename:string}|null>(null);
  const generate=async(type:"xlsx"|"csv")=>{setBusy(true);try{setFile(await prepare(type));}catch(e){toastError(e);}finally{setBusy(false);}};
  return <><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={disabled||busy}><Download className="size-4"/>{busy?"Se pregătește…":"Exportă"}</Button></DropdownMenuTrigger>
    <DropdownMenuContent><DropdownMenuItem onSelect={()=>void generate("xlsx")}>Excel (.xlsx)</DropdownMenuItem><DropdownMenuItem onSelect={()=>void generate("csv")}>CSV</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Dialog open={!!file} onOpenChange={open=>{if(!open)setFile(null);}}><DialogContent><DialogHeader><DialogTitle>Export pregătit</DialogTitle></DialogHeader><p className="break-all text-sm">{file?.filename}</p><Button onClick={()=>{if(file)void deliverCommissionFile(file.blob,file.filename).catch(toastError);}}><Download className="size-4"/>Descarcă</Button></DialogContent></Dialog>
  </>;
}