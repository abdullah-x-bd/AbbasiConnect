import test from "node:test";
import assert from "node:assert/strict";
import {cleanProfileValue,extract} from "../src/abc/llm.ts";
import {freshProfile,freshStates} from "../src/abc/fields.ts";

test("already Roman interview values pass without invoking Gemini",async()=>{
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw Error("Unexpected network call");};
    const result=await cleanProfileValue("Abdullah","script","Candidate's name");
    assert.deepEqual(result,{value:"Abdullah",uncertain:false});
  }finally{globalThis.fetch=originalFetch;}
});

test("non-Roman names are normalized before JSON storage",async()=>{
  const originalFetch=globalThis.fetch,oldKey=process.env.OPENROUTER_API_KEY;
  let calls=0;
  try{
    process.env.OPENROUTER_API_KEY="test-key";
    globalThis.fetch=async(_url,options)=>{
      calls++;
      const request=JSON.parse(options.body);
      assert.equal(request.response_format.type,"json_schema");
      assert.equal(request.model,"google/gemini-3.1-flash-lite");
      assert.ok(JSON.stringify(request.messages).includes("عبداللہ"));
      return new Response(JSON.stringify({choices:[{message:{
        content:JSON.stringify({text:"Abdullah",uncertain:false})
      }}]}),{status:200,headers:{"content-type":"application/json"}});
    };
    const result=await cleanProfileValue("عبداللہ","script","Candidate's name");
    assert.deepEqual(result,{value:"Abdullah",uncertain:false});
    assert.equal(calls,1);
  }finally{globalThis.fetch=originalFetch;
    if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY=oldKey;}
});

test("cleanup fails closed if Gemini leaves a non-Roman script",async()=>{
  const originalFetch=globalThis.fetch,oldKey=process.env.OPENROUTER_API_KEY;
  try{
    process.env.OPENROUTER_API_KEY="test-key";
    globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{
      content:JSON.stringify({text:"عبداللہ",uncertain:true})
    }}]}),{status:200,headers:{"content-type":"application/json"}});
    await assert.rejects(cleanProfileValue("عبداللہ","script","Candidate's name"),
      /reliable Roman-script version/);
  }finally{globalThis.fetch=originalFetch;
    if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY=oldKey;}
});

test("voice cleanup uses the inexpensive model even when the interviewer uses a more costly one",async()=>{
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENROUTER_API_KEY;
  const oldModel=process.env.ABC_OPENROUTER_MODEL,oldCleanup=process.env.ABC_CLEANUP_MODEL;
  try{
    process.env.OPENROUTER_API_KEY="test-key";
    process.env.ABC_OPENROUTER_MODEL="google/gemini-3-pro";
    delete process.env.ABC_CLEANUP_MODEL;
    globalThis.fetch=async(_url,options)=>{
      const request=JSON.parse(options.body);
      assert.equal(request.model,"google/gemini-3.1-flash-lite");
      assert.match(request.messages[0].content,/Never summarize, reorder, translate/);
      return new Response(JSON.stringify({choices:[{message:{
        content:JSON.stringify({text:"Woh ghar pe rehti hain.",uncertain:false})
      }}]}),{status:200,headers:{"content-type":"application/json"}});
    };
    const result=await cleanProfileValue("Woh ghar pe rehti hain","speech","Mother's occupation");
    assert.equal(result.value,"Woh ghar pe rehti hain.");
  }finally{
    globalThis.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldKey;
    if(oldModel===undefined)delete process.env.ABC_OPENROUTER_MODEL;else process.env.ABC_OPENROUTER_MODEL=oldModel;
    if(oldCleanup===undefined)delete process.env.ABC_CLEANUP_MODEL;else process.env.ABC_CLEANUP_MODEL=oldCleanup;
  }
});

test("out-of-order degree and profession survive a first pass marked INVALID",async()=>{
  const beforeFetch=globalThis.fetch,oldKey=process.env.OPENROUTER_API_KEY;
  let calls=0;
  try{
    process.env.OPENROUTER_API_KEY="test-key";
    globalThis.fetch=async(_url,options)=>{
      calls++;
      const request=JSON.parse(options.body);
      const input=JSON.parse(request.messages[1].content);
      if(calls===2){
        assert.equal(input.CURRENT_QUESTION,null);
        assert.equal(input.CURRENT_GROUP_TARGETS.length,0);
      }
      const data=calls===1?
        {classification:"INVALID",changes:[],declined_fields:[],unknown_fields:[],clarification:"",off_topic:false}:
        {classification:"VALID",changes:[
          {path:"candidate.education.highest_qualification",value_json:"Bachelor's degree",evidence:"bachelor's degree",confidence:"HIGH"},
          {path:"candidate.occupation.profession_or_role",value_json:"software engineer",evidence:"software engineer",confidence:"HIGH"}
        ],declined_fields:[],unknown_fields:[],clarification:"",off_topic:false};
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}),{status:200});
    };
    const result=await extract({profile:freshProfile(),fieldStates:freshStates(),
      currentQuestion:"candidate.full_name",recent:[],language:"en"},
      "I have a bachelor's degree and work as a software engineer.");
    assert.equal(calls,2);
    assert.equal(result.classification,"VALID");
    assert.deepEqual(result.changes.map(c=>c.path).sort(),[
      "candidate.education.highest_qualification","candidate.occupation.profession_or_role"
    ]);
  }finally{
    globalThis.fetch=beforeFetch;
    if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldKey;
  }
});
