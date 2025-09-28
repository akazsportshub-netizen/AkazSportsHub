#!/usr/bin/env python3
"""
Update product images to use placeholder service URLs
"""
import asyncio
import sys
import os
from pathlib import Path

# Add the backend directory to the path
sys.path.append(str(Path(__file__).parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from urllib.parse import quote_plus

# Load environment variables
load_dotenv()

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

def generate_placeholder_url(product_name, brand, model_code, color="E5E7EB", text_color="374151"):
    """Generate a placeholder image URL with product information"""
    text = f"{brand}+{product_name}".replace(" ", "+")
    return f"https://via.placeholder.com/400x300/{color}/{text_color}?text={quote_plus(text)}"

async def update_product_images():
    """Update all products with placeholder image URLs"""
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🖼️ Updating product images with placeholder URLs...")
    
    # Get all products
    products = await db.products.find({}).to_list(length=None)
    
    updated_count = 0
    for product in products:
        # Generate brand-specific placeholder images
        brand_colors = {
            "GOWIN": ("059669", "FFFFFF"),      # Green background, white text
            "TRIUMPH": ("DC2626", "FFFFFF"),   # Red background, white text  
            "BABBLER": ("7C3AED", "FFFFFF"),  # Purple background, white text
            "CAPTAIN": ("EA580C", "FFFFFF")    # Orange background, white text
        }
        
        bg_color, text_color = brand_colors.get(product["brand"], ("E5E7EB", "374151"))
        
        # Generate 2 placeholder images per product
        new_images = [
            generate_placeholder_url(product["name"], product["brand"], product["model_code"], bg_color, text_color),
            generate_placeholder_url(f"{product['name']}+Detail", product["brand"], product["model_code"], bg_color, text_color)
        ]
        
        # Update the product
        await db.products.update_one(
            {"id": product["id"]},
            {"$set": {"images": new_images}}
        )
        updated_count += 1
    
    print(f"✅ Updated {updated_count} products with placeholder images!")
    print(f"🎨 Each product now has 2 branded placeholder images")
    
    client.close()
    print("🎉 Product image update completed!")

if __name__ == "__main__":
    asyncio.run(update_product_images())