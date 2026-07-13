import { NextResponse } from "next/server"; import { serviceErrorResponse } from "@/lib/api/http"; import { getTask } from "@/lib/services/tasks"; import { ServiceError } from "@/lib/services/agents";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await getTask((await params).id))}catch(e){return serviceErrorResponse(e as ServiceError)}}
