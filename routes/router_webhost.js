import { debug } from "./lib/logger.js";
import configManager from "../configManager.js";

import { Router } from "express";
var router = Router();
import { encode, decode } from "html-entities";

import { prisma } from "./lib/global.js";

router.all("*", function (req, res, next) {
  // 任何请求都返回404
  res.status(404).send({ code: 404, status: "failed", message: "Not Found" });
  //next();
});
//router.get('/', function (req, res) {})

//获取源代码数据
router.get("/:id/*", function (req, res) {
  prisma.ow_projects
    .findFirst({
      where: { id: Number(req.params.id) },
      select: { source: true },
    })
    .then((PROJECT) => {
      if (!PROJECT) {
        res.locals.tip = { opt: "flash", message: "项目不存在或未发布" };
        res.status(404).json({
          status: "error",
          code: "404",
          message: "找不到页面",
        });
        return;
      }

      function getValue(arr, obj) {
        let result = obj;
        for (let i = 0; i < arr.length; i++) {
          // 检查当前键是否存在于对象中
          if (result[arr[i]] !== undefined) {
            result = result[arr[i]];
          } else {
            // 如果不存在对应的键，返回 false
            return false;
          }
        }
        return result;
      }

      var filestr = "";
      var filename = req.path.split("/");
      filename.splice(0, 2);
      //logger.debug(filename)
      //logger.debug(req.params.filename)
      //logger.debug(JSON.parse(PROJECT.source));

      if (getValue(filename, JSON.parse(PROJECT.source)) != false) {
        filestr = decode(getValue(filename, JSON.parse(PROJECT.source)));
        debug(filestr);

        res.type("html").send(decode(filestr));
      } else {
        res.status(404).send({ code: 404, status: "failed", message: "文件不存在" });
      }

      //浏览数+1
      prisma.ow_projects
        .update({
          where: { id: Number(req.params.id) },
          data: { view_count: { increment: 1 } },
        })
        .catch((err) => {
          res.locals.tip = { opt: "flash", message: "项目不存在或未发布" };
          res.status(404).json({
            status: "error",
            code: "404",
            message: "找不到页面",
          });
        });
    })
    .catch((err) => {
      res.status(500).send({ status: "error", code: "500", message: "服务器内部错误" });
    });
});

function encodeHtmlInJson(jsonObj) {
  // 检查是否为对象或数组
  if (typeof jsonObj === "object" && jsonObj !== null) {
    // 遍历对象的每个键
    for (let key in jsonObj) {
      if (jsonObj.hasOwnProperty(key)) {
        // 递归调用处理嵌套的对象或数组
        jsonObj[key] = encodeHtmlInJson(jsonObj[key]);
      }
    }
  } else if (typeof jsonObj === "string" || typeof jsonObj === "number") {
    // 将数值或字符串类型的值与指定的字符串连接
    return encode(jsonObj.toString());
  }
  // 返回处理后的对象
  return jsonObj;
}

router.post("/update/:id", function (req, res) {
  if (!res.locals.userid) {
    res.status(200).send({ status: "error", message: "未登录",code:"AUTH_ERROR_LOGIN" });
    return;
  }

  // 新作品
  //if (req.body.id == '0'){ var INSERT =`INSERT INTO ow_projects (authorid, title,source) VALUES (${res.locals.userid}, ?, ?)`; var SET = [req.body.title,req.body.data] DB.qww(INSERT, SET, function (err, newPython) { if (err || newPython.affectedRows==0) { res.status(200).send({status: "error", message: "保存失败" }); return; } res.status(200).send({status: "success", message: "保存成功", 'newid': newPython['insertId']}) }); return; }
  debug(req.body);
  debug(encodeHtmlInJson(req.body));

  // 旧作品
  prisma.ow_projects
    .update({
      where: { id: Number(req.params.id), authorid: res.locals.userid },
      data: {
        //        title:req.body.title,
        source: JSON.stringify(encodeHtmlInJson(req.body)),
        //        description:req.body.description
      },
    })
    .then((u) => {
      if (u.count == 0) {
        res.status(200).send({ status: "error", message: "保存失败" });
        return;
      }

      res.status(200).send({ status: "success", message: "保存成功" });
    })
    .catch((err) => {
      res.status(500).send({ status: "error", code: "500", message: "服务器内部错误" });
    });
});

export default router;

