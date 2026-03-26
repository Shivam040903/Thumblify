import { Request, Response } from "express";
import Thumbnail from "../models/Thumbnail.js";
import axios from "axios";
import FormData from "form-data";
import path from "path";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";

const stylePrompts = {
    'Bold & Graphic': 'eye-catching thumbnail, bold typography, vibrant colors, expressive reaction, high contrast',
    'Tech/Futuristic': 'futuristic design, glowing UI, cyberpunk lighting, high-tech look',
    'Minimalist': 'clean layout, simple shapes, lots of whitespace',
    'Photorealistic': 'ultra realistic, DSLR quality, natural lighting',
    'Illustrated': 'digital illustration, cartoon style, vibrant colors',
};

const colorSchemeDescriptions = {
    vibrant: 'vibrant colors, high saturation, bold contrast',
    sunset: 'sunset tones, orange pink glow',
    forest: 'green earthy tones',
    neon: 'neon glow, cyberpunk colors',
    purple: 'purple and magenta tones',
    monochrome: 'black and white high contrast',
    ocean: 'blue and teal tones',
    pastel: 'soft pastel colors',
};

// Generate Thumbnail
export const generateThumbnail = async (req: Request, res: Response) => {
    try {
        const { userId } = req.session;
        const {
            title,
            prompt: user_prompt,
            style,
            aspect_ratio,
            color_scheme,
            text_overlay
        } = req.body;

        // Validation
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }


        let prompt = `Create a ${stylePrompts[style as keyof typeof stylePrompts] || "professional thumbnail"} for: ${title}. `;

        if (color_scheme) {
            prompt += `Use ${colorSchemeDescriptions[color_scheme as keyof typeof colorSchemeDescriptions]}. `;
        }

        if (user_prompt) {
            prompt += `Additional details: ${user_prompt}. `;
        }

        prompt += `Make it ${aspect_ratio || "16:9"}, bold, click-worthy, and visually stunning.`;

        // Save initial DB 
        const thumbnail = await Thumbnail.create({
            userId,
            title,
            description: user_prompt || title,
            prompt_used: prompt,
            style,
            aspect_ratio,
            color_scheme,
            text_overlay,
            isGenerating: true
        });

        // Stability API Call
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("output_format", "png");

        const stabilityRes = await axios.post(
            "https://api.stability.ai/v2beta/stable-image/generate/core",
            formData,
            {
                headers: {
                    Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
                    ...formData.getHeaders(), 
                    Accept: "image/*"
                },
                responseType: "arraybuffer"
            }
        );

        if (!stabilityRes.data) {
            throw new Error("Image generation failed");
        }

        const finalBuffer = Buffer.from(stabilityRes.data);

        // Save image locally
        const filename = `thumbnail-${Date.now()}.png`;
        const filePath = path.join("images", filename);

        fs.mkdirSync("images", { recursive: true });
        fs.writeFileSync(filePath, finalBuffer);

        // Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(filePath, {
            resource_type: "image"
        });

    
        thumbnail.image_url = uploadResult.url;
        thumbnail.isGenerating = false;
        await thumbnail.save();

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return res.status(200).json({
            message: "Thumbnail generated successfully",
            thumbnail
        });

    } catch (error: any) {
        const errMsg = error.response?.data
            ? Buffer.from(error.response.data).toString()
            : error.message;

        console.error("FULL ERROR:", errMsg);

        return res.status(500).json({
            message: errMsg
        });
    }
};

//  Delete Thumbnail
export const deleteThumbnail = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId } = req.session;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        await Thumbnail.findOneAndDelete({ _id: id, userId });

        return res.json({ message: "Thumbnail deleted successfully" });

    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ message: error.message });
    }
};



//-----------------WITH GEMINI API--------------------



// import { Request, Response } from "express"
// import Thumbnail from "../models/Thumbnail.js";
// import { GenerateContentConfig, HarmBlockThreshold, HarmCategory } from "@google/genai";
// import ai from "../configs/ai.js";
// import path from "path";
// import fs from "fs";
// import {v2 as cloudinary} from "cloudinary"

// const stylePrompts = {
//     'Bold & Graphic': 'eye-catching thumbnail, bold typography, vibrant colors, expressive facial reaction, dramatic lighting, high contrast, click-worthy composition, professional style',
//     'Tech/Futuristic': 'futuristic thumbnail, sleek modern design, digital UI elements, glowing accents, holographic effects, cyber-tech aesthetic, sharp lighting, high-tech atmosphere',
//     'Minimalist': 'minimalist thumbnail, clean layout, simple shapes, limited color palette, plenty of negative space, modern flat design, clear focal point',
//     'Photorealistic': 'photorealistic thumbnail, ultra-realistic lighting, natural skin tones, candid moment, DSLR-style photography, lifestyle realism, shallow depth of field',
//     'Illustrated': 'illustrated thumbnail, custom digital illustration, stylized characters, bold outlines, vibrant colors, creative cartoon or vector art style',
// }

// const colorSchemeDescriptions = {
//     vibrant: 'vibrant and energetic colors, high saturation, bold contrasts, eye-catching palette',
//     sunset: 'warm sunset tones, orange pink and purple hues, soft gradients, cinematic glow',
//     forest: 'natural green tones, earthy colors, calm and organic palette, fresh atmosphere',
//     neon: 'neon glow effects, electric blues and pinks, cyberpunk lighting, high contrast glow',
//     purple: 'purple-dominant color palette, magenta and violet tones, modern and stylish mood',
//     monochrome: 'black and white color scheme, high contrast, dramatic lighting, timeless aesthetic',
//     ocean: 'cool blue and teal tones, aquatic color palette, fresh and clean atmosphere',
//     pastel: 'soft pastel colors, low saturation, gentle tones, calm and friendly aesthetic',
// }

// export const generateThumbnail = async (req: Request, res: Response)=>{
//     try {
//         const {userId} = req.session;
//         const {title, prompt: user_prompt, style, aspect_ratio,
//             color_scheme, text_overlay} =req.body;

//         const thumbnail = await Thumbnail.create({
//             userId,
//             title,
//             description: user_prompt || title,
//             prompt_used: user_prompt,
//             user_prompt,
//             style,
//             aspect_ratio,
//             color_scheme,
//             text_overlay,
//             isGenerating: true
//         })

//         const model = 'gemini-3-pro-image';

//         const generationConfig: GenerateContentConfig = {
//             maxOutputTokens: 32768,
//             temperature: 1,
//             topP: 0.95,
//             responseModalities: ['IMAGE'],
//             imageConfig: {
//                 aspectRatio: aspect_ratio || '16:9',
//                 imageSize: '1K',
//             },
//             safetySettings: [
//                 { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
//                 { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
//                 { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
//                 { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
//             ]
//         }

//         let prompt = `Create a ${stylePrompts[style as keyof typeof stylePrompts]} for: ${title}` ;

//         if(color_scheme){
//             prompt += `Use a ${colorSchemeDescriptions[color_scheme as keyof typeof colorSchemeDescriptions]} color scheme.`
//         }

//         if(user_prompt){
//             prompt += `Additional details: ${user_prompt}.`
//         }

//         prompt += `The thumbnail should be ${aspect_ratio}, visually stunning, and designed to maximise click-through 
//         rate. Make it bold, professional, and impossible to ignore.`

//         //generate image through ai

//         const response: any = await ai.models.generateContent({
//             model,
//             contents: [prompt],
//             config: generationConfig
//         })

//         //Check if the response is valid

//         if(!response?.candidates?.[0]?.content?.parts){
//             throw new Error('Unexpected response')
//         }

//         const parts = response.candidates[0].content.parts;
//         let finalBuffer: Buffer | null = null;
        
//         for(const part of parts){
//             if(part.inlineData){
//                 finalBuffer = Buffer.from(part.inlineData.data, 'base64')
//             }
//         }

//         const filename = `final-output-${Date.now()}.png`

//         const filePath = path.join('images', filename)


//         //Create the image directory if it doesn't exist
//         fs.mkdirSync('images', {recursive: true})

//         //Write the final image of the file
//         fs.writeFileSync(filePath, finalBuffer!);

//         const uploadResult = await cloudinary.uploader.upload(filePath, {resource_type: 'image'})

//         thumbnail.image_url = uploadResult.url;
//         thumbnail.isGenerating = false;
//         await thumbnail.save()

//         res.json({message: 'Thumbnail Generated', thumbnail})

//         // remove image from the disk

//         fs.unlinkSync(filePath)

//     } catch (error: any) {
//         console.log(error);
//         res.status(500).json({message: error.message});
//     }
// }

// // Controllers for Thumbnail Deletion

// export const deleteThumbnail = async (req: Request, res: Response)=>{
//     try {
//         const {id} = req.params;
//         const {userId} = req.session;

//         await Thumbnail.findByIdAndDelete({_id : id, userId});

//         res.json({message: 'Thumbnail deleted successfully'});

//     } catch (error : any) {
//         console.log(error);
//         res.status(500).json({message: error.message});
//     }
// }

