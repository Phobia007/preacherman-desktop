import test from "node:test";
import assert from "node:assert/strict";
import {taskCardId, prepareTaskCardNavigation} from "../public/gallery-v3/portfolio/task-card-navigation.js";
test("query-backed task sheets retain their own transition identity",()=>{
 assert.equal(taskCardId("/projects/nathan-riley?task=task-a"),"task-a");
 assert.equal(taskCardId("/projects/nathan-riley?task=task-b"),"task-b");
 assert.equal(taskCardId("/projects/casa-di-solare"),"casa-di-solare");
 assert.equal(taskCardId("/full"),null);
});
test("index entry does not invent a lateral sheet flight",()=>{
 const folio={taskJump:{source:"old"}};
 prepareTaskCardNavigation(folio,"/full","/projects/a");
 assert.equal(folio.taskJump,null);
 prepareTaskCardNavigation(folio,"/projects/a","/projects/a");
 assert.equal(folio.taskJump,null);
});
