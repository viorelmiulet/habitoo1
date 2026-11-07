import {createFileRoute} from "@tanstack/react-router";
import apartment from "@/assets/sandbox-apartment.jpg";
import house from "@/assets/sandbox-house.jpg";
import land from "@/assets/sandbox-land.jpg";
const photos:Record<string,string>={apartment,house,land};
export const Route=createFileRoute("/api/public/sandbox-photo/$kind")({server:{handlers:{GET:({params,request})=>{
  const photo=photos[params.kind];if(!photo)return new Response(null,{status:404});
  return Response.redirect(new URL(photo,request.url).href,302);
}}}});