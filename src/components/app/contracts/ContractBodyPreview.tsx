import { contractBodyBlocks } from "@/lib/contracts/viewing-table";

export function ContractBodyPreview({ body }: { body: string }) {
  return <div data-tour="contract-body" className="max-h-[620px] overflow-auto text-[15px] leading-[1.6]">
    {contractBodyBlocks(body).map((block, index) => block.type === "text" ?
      <pre key={index} className="whitespace-pre-wrap">{block.text}</pre> :
      <div key={index} className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-left" aria-label="Imobile vizionate">
          <thead><tr>{block.rows[0]?.map((cell, i) => <th key={i} className="border border-border bg-muted p-2 font-semibold">{cell}</th>)}</tr></thead>
          <tbody>{block.rows.slice(1).map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="border border-border p-2">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>)}
  </div>;
}