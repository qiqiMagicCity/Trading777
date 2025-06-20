
export const supabase={ auth:{ getUser:()=>Promise.resolve({data:{user:{email:'demo@example.com'}}}), signOut:async()=>{} } }
