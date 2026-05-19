import { getSession } from "@/lib/auth"
import NavClient from "./NavClient"

export default async function Nav() {
  const session = await getSession()
  return <NavClient session={session} />
}
